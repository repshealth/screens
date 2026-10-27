/* Tiny GitHub repo client for the briefs inbox: list files, read blobs, and commit several
   files (adds and deletes) in one commit, retrying if someone else committed first. */
(function (global) {
  "use strict";
  const API = "https://api.github.com";

  function Repo(repo, token) { this.repo = repo; this.token = token; this.branch = null; }

  Repo.prototype.req = async function (path, opts) {
    opts = opts || {};
    const headers = { authorization: "Bearer " + this.token, accept: opts.raw ? "application/vnd.github.raw+json" : "application/vnd.github+json" };
    if (opts.body) headers["content-type"] = "application/json";
    let res;
    try { res = await fetch(API + "/repos/" + this.repo + path, { method: opts.method || "GET", headers, body: opts.body ? JSON.stringify(opts.body) : undefined, cache: "no-store" }); }
    catch (e) { const err = new Error("network"); err.status = 0; throw err; }
    if (!res.ok) { const err = new Error("github_" + res.status); err.status = res.status; err.detail = await res.text().catch(() => ""); throw err; }
    if (opts.raw) return new Uint8Array(await res.arrayBuffer());
    return res.status === 204 ? null : res.json();
  };

  Repo.prototype.defaultBranch = async function () {
    if (!this.branch) this.branch = (await this.req("")).default_branch || "main";
    return this.branch;
  };

  /* All files as [{path, sha, size}]. An empty repo returns []. */
  Repo.prototype.list = async function () {
    const br = await this.defaultBranch();
    try { const t = await this.req("/git/trees/" + encodeURIComponent(br) + "?recursive=1"); return (t.tree || []).filter(e => e.type === "blob").map(e => ({ path: e.path, sha: e.sha, size: e.size })); }
    catch (e) { if (e.status === 404 || e.status === 409) return []; throw e; }
  };

  Repo.prototype.readBlob = function (sha) { return this.req("/git/blobs/" + sha, { raw: true }); };
  Repo.prototype.readJSON = async function (sha) { return JSON.parse(new TextDecoder().decode(await this.readBlob(sha))); };

  /* files: { path: Uint8Array | string | null }   (null deletes the path) */
  Repo.prototype.commit = async function (files, message) {
    const br = await this.defaultBranch(), entries = [];
    for (const [path, content] of Object.entries(files)) {
      if (content === null) { entries.push({ path, mode: "100644", type: "blob", sha: null }); continue; }
      const bytes = typeof content === "string" ? new TextEncoder().encode(content) : content;
      const blob = await this.req("/git/blobs", { method: "POST", body: { content: SSSCrypto.b64(bytes), encoding: "base64" } });
      entries.push({ path, mode: "100644", type: "blob", sha: blob.sha });
    }
    for (let attempt = 0; attempt < 4; attempt++) {
      let ref;
      try { ref = await this.req("/git/ref/heads/" + encodeURIComponent(br)); }
      catch (e) { if (e.status === 404 || e.status === 409) { const err = new Error("empty_repo"); err.status = e.status; throw err; } throw e; }
      const parent = ref.object.sha;
      const base = await this.req("/git/commits/" + parent);
      const tree = await this.req("/git/trees", { method: "POST", body: { base_tree: base.tree.sha, tree: entries } });
      const c = await this.req("/git/commits", { method: "POST", body: { message, tree: tree.sha, parents: [parent] } });
      try { await this.req("/git/refs/heads/" + encodeURIComponent(br), { method: "PATCH", body: { sha: c.sha, force: false } }); return c.sha; }
      catch (e) { if (e.status !== 422 || attempt === 3) throw e; await new Promise(r => setTimeout(r, 300 + Math.random() * 900)); }
    }
  };

  global.SSSRepo = Repo;
})(window);
