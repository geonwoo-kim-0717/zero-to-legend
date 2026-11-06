/** 생성 비용을 아끼기 위해 비활성 객체를 재사용하는 단순 오브젝트 풀 */
export class Pool<T extends { active: boolean }> {
  readonly items: T[] = [];
  constructor(private readonly factory: () => T) {}

  acquire(): T {
    for (const item of this.items) if (!item.active) return item;
    const item = this.factory();
    this.items.push(item);
    return item;
  }

  countActive(): number {
    let n = 0;
    for (const item of this.items) if (item.active) n++;
    return n;
  }
}
