export default class Exponential {
  readonly mantissa;
  readonly exponent;

  constructor({ mantissa, exponent }) {
    this.mantissa = mantissa
    this.exponent = exponent
  }

  toJSON () {
    return [
      this.mantissa,
      this.exponent,
    ]
  }
}
