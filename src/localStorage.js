function matches(doc, filter) {
  return Object.entries(filter || {}).every(([k, v]) => doc[k] === v);
}

class Collection {
  constructor() {
    this.docs = [];
  }

  _wrap(doc) {
    if (Object.prototype.hasOwnProperty.call(doc, "save")) return doc;
    const self = this;
    Object.defineProperty(doc, "save", {
      value: async function () {
        const idx = self.docs.findIndex((d) => d === doc || d._id === doc._id);
        if (idx >= 0) self.docs[idx] = doc;
        return doc;
      },
      enumerable: false,
      configurable: true,
    });
    return doc;
  }

  async create(data) {
    const doc = { _id: `${Date.now()}_${Math.random().toString(36).slice(2)}`, createdAt: new Date(), updatedAt: new Date(), ...data };
    this.docs.push(doc);
    return this._wrap(doc);
  }

  async insertMany(items) {
    const created = [];
    for (const item of items) created.push(await this.create(item));
    return created;
  }

  async findOne(filter) {
    const doc = this.docs.find((d) => matches(d, filter));
    return doc ? this._wrap(doc) : null;
  }

  find(filter = {}, projection = null) {
    let results = this.docs.filter((d) => matches(d, filter));
    const api = {
      sort: (sortObj) => {
        const [key, dir] = Object.entries(sortObj || {})[0] || ["createdAt", 1];
        results = [...results].sort((a, b) => (a[key] > b[key] ? 1 : -1) * (dir < 0 ? -1 : 1));
        return api;
      },
      limit: (n) => {
        results = results.slice(0, n);
        return api;
      },
      then: (resolve) => {
        let out = results;
        if (projection) {
          const fields = projection.split(" ").filter((f) => !f.startsWith("-"));
          if (fields.length) out = out.map((d) => Object.fromEntries(fields.map((f) => [f, d[f]])));
        }
        resolve(out.map((d) => this._wrap({ ...d })));
      },
    };
    return api;
  }

  async deleteMany(filter) {
    this.docs = this.docs.filter((d) => !matches(d, filter));
  }

  async updateOne(filter, update, { upsert = false } = {}) {
    const idx = this.docs.findIndex((d) => matches(d, filter));
    if (idx >= 0) {
      this.docs[idx] = { ...this.docs[idx], ...update, updatedAt: new Date() };
    } else if (upsert) {
      await this.create({ ...filter, ...update });
    }
  }
}

const collections = {
  Project: new Collection(),
  ProjectFile: new Collection(),
  TestRun: new Collection(),
  AgentRun: new Collection(),
};

module.exports = collections;