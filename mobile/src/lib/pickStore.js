// Hands the picked map location from /pick-location back to /create
let value = null;
export const setPicked = (v) => { value = v; };
export const takePicked = () => { const v = value; value = null; return v; };
