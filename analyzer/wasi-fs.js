// A compact WASI preview1 implementation with a read-only IN-MEMORY filesystem, enough to run the Arche
// analyzer (arche-analyzer.wasm) in a browser: it opens core.arche + stdlib modules (path_open + fd_read +
// fd_readdir + stat over preopened dirs) and prints diagnostics to stdout. No dependencies, no server.
//
// Preopens: fd 3 = /core, fd 4 = /stdlib, fd 5 = /work (the source file is injected into /work before a run).
// The FS is a tree built from a flat { "/core/core.arche": "…", … } manifest. Everything is read-only —
// the analyzer only reads; --dump writes to stdout, captured here.
(function (global) {
  const OK = 0, BADF = 8, NOENT = 44, INVAL = 28, NOSYS = 52, NOTDIR = 54;
  const FT_CHAR = 2, FT_DIR = 3, FT_FILE = 4;
  const enc = new TextEncoder(), dec = new TextDecoder();

  // Build a directory tree from the flat path→content manifest.
  function buildTree(manifest) {
    const root = { type: "dir", children: {} };
    for (const [path, content] of Object.entries(manifest)) {
      const parts = path.split("/").filter(Boolean);
      let node = root;
      for (let i = 0; i < parts.length - 1; i++) {
        node.children[parts[i]] ||= { type: "dir", children: {} };
        node = node.children[parts[i]];
      }
      node.children[parts[parts.length - 1]] = { type: "file", bytes: enc.encode(content) };
    }
    return root;
  }

  function resolve(node, relPath) {
    for (const part of relPath.split("/")) {
      if (part === "" || part === ".") continue;
      if (node.type !== "dir") return null;
      node = node.children[part];
      if (!node) return null;
    }
    return node;
  }

  class WasiFS {
    // manifest: { "/core/core.arche": "…", … }; argv/env for the run.
    constructor(manifest, { args = [], env = {} } = {}) {
      this.root = buildTree(manifest);
      this.args = args;
      this.env = Object.entries(env).map(([k, v]) => `${k}=${v}`);
      this.memory = null;
      this.stdout = "";
      this.stderr = "";
      // preopen dirs on fds 3,4,5; the source dir /work starts with just the injected file.
      this.preopens = { 3: "/core", 4: "/stdlib", 5: "/work" };
      this.fds = {
        3: { node: this.dirFor("/core"), off: 0 },
        4: { node: this.dirFor("/stdlib"), off: 0 },
        5: { node: this.dirFor("/work"), off: 0 },
      };
      this.nextFd = 6;
    }
    // Ensure a preopen dir node exists (so an empty /work is a valid dir even before a file is injected).
    dirFor(abs) {
      const parts = abs.split("/").filter(Boolean);
      let node = this.root;
      for (const p of parts) { node.type === "dir" || (node = null); node = (node && (node.children[p] ||= { type: "dir", children: {} })); }
      return node;
    }
    // Inject/replace the source file at an absolute path in the memfs (e.g. /work/prog.arche).
    writeFile(abs, content) {
      const parts = abs.split("/").filter(Boolean);
      let node = this.root;
      for (let i = 0; i < parts.length - 1; i++) node = (node.children[parts[i]] ||= { type: "dir", children: {} });
      node.children[parts[parts.length - 1]] = { type: "file", bytes: enc.encode(content) };
    }
    // Read a file's bytes back out of the memfs (e.g. the compiler's /work/out.wasm), or null if absent.
    readFile(abs) { const n = resolve(this.root, abs); return n && n.type === "file" ? n.bytes : null; }

    _dv() { return new DataView(this.memory.buffer); }
    _u8() { return new Uint8Array(this.memory.buffer); }

    get imports() {
      const self = this;
      const wasi = {
        proc_exit(code) { throw { __wasi_exit: code | 0 }; },
        sched_yield: () => OK,
        // args / env
        args_sizes_get(cnt, bufLen) { const dv = self._dv(); dv.setUint32(cnt, self.args.length, true); dv.setUint32(bufLen, self.args.reduce((n, a) => n + enc.encode(a).length + 1, 0), true); return OK; },
        args_get(argv, buf) { const dv = self._dv(), u8 = self._u8(); let p = buf; self.args.forEach((a, i) => { dv.setUint32(argv + i * 4, p, true); const b = enc.encode(a); u8.set(b, p); p += b.length; u8[p++] = 0; }); return OK; },
        environ_sizes_get(cnt, bufLen) { const dv = self._dv(); dv.setUint32(cnt, self.env.length, true); dv.setUint32(bufLen, self.env.reduce((n, e) => n + enc.encode(e).length + 1, 0), true); return OK; },
        environ_get(env, buf) { const dv = self._dv(), u8 = self._u8(); let p = buf; self.env.forEach((e, i) => { dv.setUint32(env + i * 4, p, true); const b = enc.encode(e); u8.set(b, p); p += b.length; u8[p++] = 0; }); return OK; },
        // clocks / random
        clock_time_get(_id, _prec, out) { self._dv().setBigUint64(out, 0n, true); return OK; },
        clock_res_get(_id, out) { self._dv().setBigUint64(out, 1000000n, true); return OK; },
        random_get(buf, len) { crypto.getRandomValues(self._u8().subarray(buf, buf + len)); return OK; },
        poll_oneoff: () => NOSYS,
        // stdio + files
        fd_write(fd, iovs, n, nwritten) {
          const dv = self._dv(), u8 = self._u8(); let total = 0;
          const chunks = [];
          for (let i = 0; i < n; i++) { const p = iovs + i * 8, buf = dv.getUint32(p, true), len = dv.getUint32(p + 4, true); chunks.push(u8.slice(buf, buf + len)); total += len; }
          const e = self.fds[fd];
          if (fd >= 3 && e && e.node && e.node.type === "file") { // write to a real file (e.g. the compiler's out.wasm)
            let extra = 0; for (const c of chunks) extra += c.length;
            const grown = new Uint8Array(e.node.bytes.length + extra);
            grown.set(e.node.bytes); let o = e.node.bytes.length;
            for (const c of chunks) { grown.set(c, o); o += c.length; }
            e.node.bytes = grown;
          } else { // stdout/stderr
            let s = ""; for (const c of chunks) s += dec.decode(c);
            if (fd === 2) self.stderr += s; else self.stdout += s;
          }
          dv.setUint32(nwritten, total, true); return OK;
        },
        fd_read(fd, iovs, n, nread) {
          const e = self.fds[fd]; if (!e || !e.node || e.node.type !== "file") return BADF;
          const dv = self._dv(), u8 = self._u8(); let total = 0;
          for (let i = 0; i < n; i++) {
            const p = iovs + i * 8, buf = dv.getUint32(p, true), len = dv.getUint32(p + 4, true);
            const chunk = e.node.bytes.subarray(e.off, e.off + len);
            u8.set(chunk, buf); e.off += chunk.length; total += chunk.length;
            if (chunk.length < len) break;
          }
          dv.setUint32(nread, total, true); return OK;
        },
        fd_seek(fd, offset, whence, out) {
          const e = self.fds[fd]; if (!e || !e.node) return BADF;
          const size = e.node.type === "file" ? e.node.bytes.length : 0;
          const off = Number(offset);
          e.off = whence === 0 ? off : whence === 1 ? e.off + off : size + off;
          self._dv().setBigUint64(out, BigInt(e.off), true); return OK;
        },
        fd_close(fd) { if (fd >= 6) delete self.fds[fd]; return OK; },
        fd_fdstat_get(fd, buf) {
          const dv = self._dv();
          let ft = FT_CHAR; // stdio
          if (fd >= 3) { const e = self.fds[fd]; if (!e || !e.node) return BADF; ft = e.node.type === "dir" ? FT_DIR : FT_FILE; }
          dv.setUint8(buf, ft); dv.setUint16(buf + 2, 0, true);
          dv.setBigUint64(buf + 8, 0xffffffffffffffffn, true); dv.setBigUint64(buf + 16, 0xffffffffffffffffn, true);
          return OK;
        },
        fd_fdstat_set_flags: () => OK,
        // preopens
        fd_prestat_get(fd, buf) { const name = self.preopens[fd]; if (!name) return BADF; const dv = self._dv(); dv.setUint8(buf, 0 /*dir*/); dv.setUint32(buf + 4, enc.encode(name).length, true); return OK; },
        fd_prestat_dir_name(fd, path, len) { const name = self.preopens[fd]; if (!name) return BADF; self._u8().set(enc.encode(name).subarray(0, len), path); return OK; },
        // path ops (relative to a preopen dir fd)
        path_open(dirfd, _dirflags, pathPtr, pathLen, oflags, _rb, _ri, _fdflags, outFd) {
          const dir = self.fds[dirfd]; if (!dir || !dir.node || dir.node.type !== "dir") return NOTDIR;
          const rel = dec.decode(self._u8().subarray(pathPtr, pathPtr + pathLen));
          let node = resolve(dir.node, rel);
          if (!node && (oflags & 0x1)) { // O_CREAT: make the file in its (existing) parent dir
            const parts = rel.split("/").filter((p) => p && p !== ".");
            let d = dir.node;
            for (let i = 0; i < parts.length - 1; i++) { d = d.children[parts[i]]; if (!d || d.type !== "dir") return NOENT; }
            node = { type: "file", bytes: new Uint8Array(0) };
            d.children[parts[parts.length - 1]] = node;
          }
          if (!node) return NOENT;
          if (node.type === "file" && (oflags & 0x8)) node.bytes = new Uint8Array(0); // O_TRUNC
          const fd = self.nextFd++; self.fds[fd] = { node, off: 0 };
          self._dv().setUint32(outFd, fd, true); return OK;
        },
        path_filestat_get(dirfd, _flags, pathPtr, pathLen, buf) {
          const dir = self.fds[dirfd]; if (!dir || !dir.node) return NOTDIR;
          const rel = dec.decode(self._u8().subarray(pathPtr, pathPtr + pathLen));
          const node = resolve(dir.node, rel); if (!node) return NOENT;
          const dv = self._dv();
          for (let i = 0; i < 64; i += 8) dv.setBigUint64(buf + i, 0n, true);
          dv.setUint8(buf + 16, node.type === "dir" ? FT_DIR : FT_FILE);   // filetype
          dv.setBigUint64(buf + 32, BigInt(node.type === "file" ? node.bytes.length : 0), true); // size
          return OK;
        },
        fd_readdir(fd, buf, bufLen, cookie, bufused) {
          const e = self.fds[fd]; if (!e || !e.node || e.node.type !== "dir") return NOTDIR;
          const names = Object.keys(e.node.children); // no "."/".." → the loader never self-recurses
          const dv = self._dv(), u8 = self._u8();
          let off = 0, i = Number(cookie);
          for (; i < names.length; i++) {
            const name = names[i], nameB = enc.encode(name), child = e.node.children[name];
            const need = 24 + nameB.length;
            if (off + need > bufLen) break;
            dv.setBigUint64(buf + off, BigInt(i + 1), true);          // d_next
            dv.setBigUint64(buf + off + 8, BigInt(i + 1), true);      // d_ino
            dv.setUint32(buf + off + 16, nameB.length, true);         // d_namlen
            dv.setUint8(buf + off + 20, child.type === "dir" ? FT_DIR : FT_FILE); // d_type
            u8.set(nameB, buf + off + 24);
            off += need;
          }
          dv.setUint32(bufused, off, true); return OK;
        },
      };
      return { wasi_snapshot_preview1: wasi };
    }

    // Instantiate + run to completion; returns the exit code. stdout/stderr populated. Any WASI import the
    // module declares that we don't implement (e.g. path_readlink on /proc/self/exe) is auto-stubbed to
    // return NOSYS, so instantiation never fails on an unhandled call — the C code falls through gracefully.
    run(module) {
      this.stdout = ""; this.stderr = "";
      const impl = this.imports.wasi_snapshot_preview1;
      const wasi = {};
      for (const imp of WebAssembly.Module.imports(module)) {
        if (imp.module === "wasi_snapshot_preview1") wasi[imp.name] = impl[imp.name] || (() => NOSYS);
      }
      const instance = new WebAssembly.Instance(module, { wasi_snapshot_preview1: wasi });
      this.memory = instance.exports.memory;
      try { instance.exports._start(); return 0; }
      catch (e) { if (e && typeof e.__wasi_exit === "number") return e.__wasi_exit; throw e; }
    }
  }

  global.WasiFS = WasiFS;
  if (typeof module !== "undefined" && module.exports) module.exports = { WasiFS };
})(typeof window !== "undefined" ? window : globalThis);
