import * as bigint from 'bigint'
import * as LRU from 'lru-cache'
import MItem from './MItem'

const BI0 = bigint('0');
const BI1000 = bigint('1000');

const ITEMS = [
  {
    item_id: 1,
    power1: 0,
    power2: 1,
    power3: 0,
    power4: 1,
    price1: 0,
    price2: 1,
    price3: 1,
    price4: 1,
  },
  {
    item_id: 2,
    power1: 0,
    power2: 1,
    power3: 1,
    power4: 1,
    price1: 0,
    price2: 1,
    price3: 2,
    price4: 1,
  },
  {
    item_id: 3,
    power1: 1,
    power2: 10,
    power3: 0,
    power4: 2,
    price1: 1,
    price2: 3,
    price3: 1,
    price4: 2,
  },
  {
    item_id: 4,
    power1: 1,
    power2: 24,
    power3: 1,
    power4: 2,
    price1: 1,
    price2: 10,
    price3: 0,
    price4: 3,
  },
  {
    item_id: 5,
    power1: 1,
    power2: 25,
    power3: 100,
    power4: 3,
    price1: 2,
    price2: 20,
    price3: 20,
    price4: 2,
  },
  {
    item_id: 6,
    power1: 1,
    power2: 30,
    power3: 147,
    power4: 13,
    price1: 1,
    price2: 22,
    price3: 69,
    price4: 17,
  },
  {
    item_id: 7,
    power1: 5,
    power2: 80,
    power3: 128,
    power4: 6,
    price1: 6,
    price2: 61,
    price3: 200,
    price4: 5,
  },
  {
    item_id: 8,
    power1: 20,
    power2: 340,
    power3: 180,
    power4: 3,
    price1: 9,
    price2: 105,
    price3: 134,
    price4: 14,
  },
  {
    item_id: 9,
    power1: 55,
    power2: 520,
    power3: 335,
    power4: 5,
    price1: 48,
    price2: 243,
    price3: 600,
    price4: 7,
  },
  {
    item_id: 10,
    power1: 157,
    power2: 1071,
    power3: 1700,
    power4: 12,
    price1: 157,
    price2: 625,
    price3: 1000,
    price4: 13,
  },
  {
    item_id: 11,
    power1: 2000,
    power2: 7500,
    power3: 2600,
    power4: 3,
    price1: 2001,
    price2: 5430,
    price3: 1000,
    price4: 3,
  },
  {
    item_id: 12,
    power1: 1000,
    power2: 9000,
    power3: 0,
    power4: 17,
    price1: 963,
    price2: 7689,
    price3: 1,
    price4: 19,
  },
  {
    item_id: 13,
    power1: 11000,
    power2: 11000,
    power3: 11000,
    power4: 23,
    price1: 10000,
    price2: 2,
    price3: 2,
    price4: 29,
  },
]

export default class Game {
  readonly pool: any;
  readonly roomName: string;
  readonly mItems: Array<MItem>;

  constructor(roomName, pool) {
    this.roomName = roomName
    this.pool = pool
    this.mItems = [];

    for (let item of ITEMS) {
      this.mItems[item.item_id] = new MItem(item)
    }
  }

  async getStatus() {
    const currentTime = await this.updateRoomTimeSimple(0)
    const [addings] = await this.pool.query('SELECT time, isu FROM adding WHERE room_name = ?', [this.roomName])
    const [buyings] = await this.pool.query('SELECT item_id, ordinal, time FROM buying WHERE room_name = ?', [this.roomName])

    const status = this.calcStatus(currentTime, this.mItems, addings, buyings)

    // calcStatusに時間がかかる可能性があるので タイムスタンプを取得し直す
    const latestTime = Date.now();
    status.time = latestTime

    return status
  }

  async addIsu(reqIsu, reqTime) {
    await this.updateRoomTimeSimple(reqTime)

    try {
      const connection = await this.pool.getConnection()
      await connection.beginTransaction()

      try {
        await connection.query('INSERT INTO adding(room_name, time, isu) VALUES (?, ?, \'0\') ON DUPLICATE KEY UPDATE isu=isu', [this.roomName, reqTime])

        const [[{ isu }]] = await connection.query('SELECT isu FROM adding WHERE room_name = ? AND time = ? FOR UPDATE', [this.roomName, reqTime])
        const newIsu = reqIsu.add(bigint(isu))

        await connection.query('UPDATE adding SET isu = ? WHERE room_name = ? AND time = ?', [newIsu.toString(), this.roomName, reqTime])
        await connection.commit()
        connection.release()
        return true

      } catch (e) {
        await connection.rollback()
        connection.release()
        throw e
      }
    } catch (e) {
      console.error(e)
      return false
    }
  }

  async buyItem(itemId, countBought, reqTime) {
    await this.updateRoomTimeSimple(reqTime)

    try {
      const connection = await this.pool.getConnection()
      await connection.beginTransaction()

      try {
        const [[{ countBuying }]] = await connection.query('SELECT COUNT(*) as countBuying FROM buying WHERE room_name = ? AND item_id = ?', [this.roomName, itemId])
        if (parseInt(countBuying, 10) != countBought) {
          throw new Error(`roomName=${this.roomName}, itemId=${itemId} countBought+1=${countBought + 1} is already bought`)
        }

        let totalMilliIsu = BI0;
        const [addings] = await connection.query('SELECT isu FROM adding WHERE room_name = ? AND time <= ?', [this.roomName, reqTime])
        for (let { isu } of addings) {
          totalMilliIsu = totalMilliIsu.add(bigint(isu).mul(BI1000))
        }

        const [buyings] = await connection.query('SELECT item_id, ordinal, time FROM buying WHERE room_name = ?', [this.roomName])
        for (let b of buyings) {
          // let [[mItem]] = await connection.query('SELECT * FROM m_item WHERE item_id = ?', [b.item_id])
          // let [[mItem]] = await connection.query('SELECT * FROM m_item WHERE item_id = ?', [b.item_id])
          // let item = new MItem(mItem)
          let item = this.mItems[b.item_id]
          let cost = item.getPrice(parseInt(b.ordinal, 10)).mul(BI1000)
          totalMilliIsu = totalMilliIsu.sub(cost)
          if (parseInt(b.time, 10) <= reqTime) {
            let gain = item.getPower(parseInt(b.ordinal, 10)).mul(bigint(reqTime - parseInt(b.time, 10)))
            totalMilliIsu = totalMilliIsu.add(gain)
          }
        }

        // const [[mItem]] = await connection.query('SELECT * FROM m_item WHERE item_id = ?', [itemId])
        // const item = new MItem(mItem)
        const item = this.mItems[itemId]
        const need = item.getPrice(countBought + 1).mul(BI1000)
        if (totalMilliIsu.cmp(need) < 0) {
          throw new Error('not enough')
        }

        await connection.query('INSERT INTO buying(room_name, item_id, ordinal, time) VALUES(?, ?, ?, ?)', [this.roomName, itemId, countBought + 1, reqTime])
        await connection.commit()
        connection.release()
        return true

      } catch (e) {
        await connection.rollback()
        connection.release()
        throw e
      }
    } catch (e) {
      console.error(e)
      return false
    }
  }


  async insertRoomTime() {
    await this.pool.query(
      'INSERT IGNORE INTO room_time(room_name,time) VALUES (?,0)',
      [this.roomName]
    )
  }

  async updateRoomTimeSimple(reqTime) {
    const currentTime = Date.now();
    if (reqTime !== 0) {
      if (reqTime < currentTime) {
        throw new Error('reqTime is past')
      }
    }

    await this.pool.query(
      'UPDATE room_time SET time = ? WHERE room_name = ? and ? > time ',
      [currentTime, this.roomName, currentTime]
    )
    return currentTime
  }


  // 部屋のロックを取りタイムスタンプを更新する
  //
  // トランザクション開始後この関数を呼ぶ前にクエリを投げると、
  // そのトランザクション中の通常のSELECTクエリが返す結果がロック取得前の
  // 状態になることに注意 (keyword: MVCC, repeatable read).
  async updateRoomTime(connection, reqTime) {
    // See page 13 and 17 in https://www.slideshare.net/ichirin2501/insert-51938787
    await connection.query('INSERT INTO room_time(room_name, time) VALUES (?, 0) ON DUPLICATE KEY UPDATE time = time', [this.roomName])
    const [[{ time }]] = await connection.query('SELECT time FROM room_time WHERE room_name = ? FOR UPDATE', [this.roomName])
    const currentTime = Date.now();
    if (parseInt(time, 10) > currentTime) {
      throw new Error('room time is future')
    }
    if (reqTime !== 0) {
      if (reqTime < currentTime) {
        throw new Error('reqTime is past')
      }
    }

    await connection.query('UPDATE room_time SET time = ? WHERE room_name = ?', [currentTime, this.roomName])
    return currentTime
  }

  calcStatus(currentTime, mItems, addings, buyings) {
    const t0 = process.env.NODE_ENV !== 'production' ? Date.now() : null;
    // 1ミリ秒に生産できる椅子の単位をミリ椅子とする
    let totalMilliIsu = BI0
    let totalPower = BI0

    const itemPower = {} // ItemID => Power
    const itemPrice = {} // ItemID => Price
    const itemOnSale = {} // ItemID => OnSale
    const itemBuilt = {} // ItemID => BuiltCount
    const itemBought = {} // ItemID => CountBought
    const itemBuilding = {} // ItemID => Buildings
    const itemPower0 = {} // ItemID => currentTime における Power
    const itemBuilt0 = {} // ItemID => currentTime における BuiltCount

    const addingAt = {} // Time => currentTime より先の Adding
    const buyingAt = {} // Time => currentTime より先の Buying

    for (let itemId in mItems) {
      itemPower[itemId] = BI0
      itemBuilding[itemId] = []
    }

    for (let a of addings) {
      // adding は adding.time に isu を増加させる
      if (a.time <= currentTime) {
        totalMilliIsu = totalMilliIsu.add(bigint(a.isu).mul(BI1000))
      } else {
        addingAt[a.time] = a
      }
    }

    for (let b of buyings) {
      // buying は 即座に isu を消費し buying.time からアイテムの効果を発揮する
      itemBought[b.item_id] = itemBought[b.item_id] ? itemBought[b.item_id] + 1 : 1
      const m = mItems[b.item_id]
      totalMilliIsu = totalMilliIsu.sub(m.getPrice(b.ordinal).mul(BI1000))

      if (b.time <= currentTime) {
        itemBuilt[b.item_id] = itemBuilt[b.item_id] ? itemBuilt[b.item_id] + 1 : 1
        const power = m.getPower(itemBought[b.item_id])
        totalMilliIsu = totalMilliIsu.add(power.mul(bigint(currentTime - b.time)))
        totalPower = totalPower.add(power)
        itemPower[b.item_id] = itemPower[b.item_id].add(power)
      } else {
        buyingAt[b.time] = buyingAt[b.time] || []
        buyingAt[b.time].push(b)
      }
    }

    for (let itemId in mItems) {
      const m = mItems[itemId]
      itemPower0[m.itemId] = this.big2exp(itemPower[m.itemId])
      itemBuilt0[m.itemId] = itemBuilt[m.itemId]
      const price = m.getPrice((itemBought[m.itemId] || 0) + 1)
      itemPrice[m.itemId] = price
      if (0 <= totalMilliIsu.cmp(price.mul(BI1000))) {
        itemOnSale[m.itemId] = 0 // 0 は 時刻 currentTime で購入可能であることを表す
      }
    }

    const schedule = [
      {
        time: currentTime,
        milli_isu: this.big2exp(totalMilliIsu),
        total_power: this.big2exp(totalPower),
      }
    ]

    // イベントがあるなら
    if (Object.keys(addingAt).length + Object.keys(buyingAt).length > 0) {
      // currentTime から 1000 ミリ秒先までシミュレーションする
      for (let t = currentTime + 1; t <= currentTime + 1000; t++) {
        totalMilliIsu = totalMilliIsu.add(totalPower)
        let updated = false

        // 時刻 t で発生する adding を計算する
        if (addingAt[t]) {
          let a = addingAt[t]
          updated = true
          totalMilliIsu = totalMilliIsu.add(bigint(a.isu).mul(BI1000))
        }

        // 時刻 t で発生する buying を計算する
        if (buyingAt[t]) {
          updated = true
          const updatedID = {}
          for (let b of buyingAt[t]) {
            const m = mItems[b.item_id]
            updatedID[b.item_id] = true
            itemBuilt[b.item_id] = itemBuilt[b.item_id] ? itemBuilt[b.item_id] + 1 : 1
            const power = m.getPower(b.ordinal)
            itemPower[b.item_id] = itemPower[b.item_id].add(power)
            totalPower = totalPower.add(power)
          }
          for (let id in updatedID) {
            itemBuilding[id].push({
              time: t,
              count_built: itemBuilt[id],
              power: this.big2exp(itemPower[id]),
            })
          }
        }

        if (updated) {
          schedule.push({
            time: t,
            milli_isu: this.big2exp(totalMilliIsu),
            total_power: this.big2exp(totalPower),
          })
        }

        // 時刻 t で購入可能になったアイテムを記録する
        for (let itemId in mItems) {
          if (typeof itemOnSale[itemId] !== 'undefined') {
            continue;
          }
          if (0 <= totalMilliIsu.cmp(itemPrice[itemId].mul(BI1000))) {
            itemOnSale[itemId] = t
          }
        }
      }
    } else {
      // イベント無ければ掛け算
      const prevTotalMilliIsu = totalMilliIsu
      totalMilliIsu = totalMilliIsu.add(totalPower.mul(1000))
      // 購入可能時刻は逆算で求める
      for (let itemId in mItems) {
        if (typeof itemOnSale[itemId] !== 'undefined') {
          continue;
        }
        if (0 <= totalMilliIsu.cmp(itemPrice[itemId].mul(BI1000))) {
          itemOnSale[itemId] = currentTime + itemPrice[itemId].mul(BI1000).sub(prevTotalMilliIsu).div(totalPower).toNumber()
        }
      }
    }

    const gsAdding = []
    for (let a of Object.values(addingAt)) {
      gsAdding.push(a)
    }

    const gsItems = []
    for (let itemId in mItems) {
      gsItems.push({
        item_id: parseInt(itemId, 10),
        count_bought: itemBought[itemId] || 0,
        count_built: itemBuilt0[itemId] || 0,
        next_price: this.big2exp(itemPrice[itemId]),
        power: itemPower0[itemId],
        building: itemBuilding[itemId],
      })
    }

    const gsOnSale = []
    for (let itemId in itemOnSale) {
      let t = itemOnSale[itemId]
      gsOnSale.push({
        item_id: parseInt(itemId, 10),
        time: t,
      })
    }
    const result = {
      time: 0,
      adding: gsAdding,
      schedule: schedule,
      items: gsItems,
      on_sale: gsOnSale,
    };

    if (t0) {
      console.log('calcStatus', currentTime, Date.now() - t0);
    }
    return result;
  }

  big2exp(n): Array<number> {
    const s = n.toString()
    if (s.length <= 15) {
      return [
        n.toNumber(), // mantissa
        0, // exponent
      ]
    }

    const t = Number(s.slice(0, 15))
    return [
      t, // mantissa
      s.length - 15, // exponent
    ];
  }
}
