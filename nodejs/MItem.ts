import * as bigint from 'bigint'

export default class MItem {
  readonly itemId;
  readonly power1;
  readonly power2;
  readonly power3;
  readonly power4;
  readonly price1;
  readonly price2;
  readonly price3;
  readonly price4;
  readonly priceCache: any = {};
  readonly powerCache: any = {};

  constructor({
    item_id,
    power1,
    power2,
    power3,
    power4,
    price1,
    price2,
    price3,
    price4,
  }) {
    this.itemId = item_id
    this.power1 = power1
    this.power2 = power2
    this.power3 = power3
    this.power4 = power4
    this.price1 = price1
    this.price2 = price2
    this.price3 = price3
    this.price4 = price4
  }

  getPrice (count) {
    if (this.priceCache[count]) {
      return this.priceCache[count]
    }
    // price(x):=(cx+1)*d^(ax+b)
    const a = this.price1
    const b = this.price2
    const c = this.price3
    const d = bigint(this.price4)
    const x = count

    const s = bigint(c*x + 1)
    const u = bigint(a*x + b)
    const t = d.pow(u)
    const result = s.mul(t)
    this.priceCache[count] = result
    return result
  }

  getPower (count) {
    if (this.powerCache[count]) {
      return this.powerCache[count]
    }
    // power(x):=(cx+1)*d^(ax+b)
    const a = this.power1
    const b = this.power2
    const c = this.power3
    const d = bigint(this.power4)
    const x = count

    const s = bigint(c*x + 1)
    const u = bigint(a*x + b)
    const t = d.pow(u)
    const result = s.mul(t)
    this.powerCache[count] = result
    return result
    // return s.mul(t)
  }

  toJSON () {
    return {
      item_id: this.itemId,
      power1: this.power1,
      power2: this.power2,
      power3: this.power3,
      power4: this.power4,
      price1: this.price1,
      price2: this.price2,
      price3: this.price3,
      price4: this.price4,
    }
  }
}
