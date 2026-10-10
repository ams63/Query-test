// Small input validation helpers → throw 400 VALIDATION_ERROR with field details.
const { HttpError } = require('./http');

function check(rules, input) {
  const out = {};
  const errors = {};
  for (const [key, rule] of Object.entries(rules)) {
    let v = input[key];
    if (typeof v === 'string' && rule.type !== 'password') v = v.trim();
    if (v === undefined || v === null || v === '') {
      if (rule.required) errors[key] = 'required';
      else if (rule.default !== undefined) out[key] = rule.default;
      continue;
    }
    switch (rule.type) {
      case 'string': case 'password':
        v = String(v);
        if (rule.min && v.length < rule.min) errors[key] = `min:${rule.min}`;
        else if (rule.max && v.length > rule.max) errors[key] = `max:${rule.max}`;
        else if (rule.enum && !rule.enum.includes(v)) errors[key] = 'invalid';
        break;
      case 'email':
        v = String(v).toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) || v.length > 200) errors[key] = 'email';
        break;
      case 'number':
        v = Number(v);
        if (!Number.isFinite(v) || (rule.min !== undefined && v < rule.min) || (rule.max !== undefined && v > rule.max)) errors[key] = 'number';
        break;
      case 'bool':
        v = v === true || v === 'true' || v === '1' || v === 1;
        break;
      default: break;
    }
    out[key] = v;
  }
  if (Object.keys(errors).length) throw new HttpError(400, 'VALIDATION_ERROR', errors);
  return out;
}

module.exports = { check };
