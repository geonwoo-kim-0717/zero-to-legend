/** 균일 격자 공간 분할: 주변 객체만 빠르게 찾아 충돌 검사 비용을 O(n²)에서 거의 O(n)으로 줄인다 */
export class SpatialGrid<T extends { x: number; y: number }> {
  private cells = new Map<number, T[]>();
  private used: T[][] = [];

  constructor(private readonly size: number) {}

  private key(cx: number, cy: number): number {
    return ((cx & 0xffff) << 16) | (cy & 0xffff);
  }

  clear(): void {
    for (const arr of this.used) arr.length = 0;
    this.used.length = 0;
    // 플레이어가 멀리 이동하면 빈 칸이 계속 쌓이므로 가끔 비운다
    if (this.cells.size > 4096) this.cells.clear();
  }

  insert(item: T): void {
    const k = this.key(Math.floor(item.x / this.size), Math.floor(item.y / this.size));
    let arr = this.cells.get(k);
    if (!arr) {
      arr = [];
      this.cells.set(k, arr);
    }
    if (arr.length === 0) this.used.push(arr);
    arr.push(item);
  }

  query(x: number, y: number, radius: number, out: T[]): T[] {
    out.length = 0;
    const x0 = Math.floor((x - radius) / this.size);
    const x1 = Math.floor((x + radius) / this.size);
    const y0 = Math.floor((y - radius) / this.size);
    const y1 = Math.floor((y + radius) / this.size);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const arr = this.cells.get(this.key(cx, cy));
        if (arr) for (const item of arr) out.push(item);
      }
    }
    return out;
  }
}
