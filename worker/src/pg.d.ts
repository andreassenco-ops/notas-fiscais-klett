declare module 'pg' {
  export class Pool {
    constructor(config?: Record<string, unknown>);
    query(text: string, values?: unknown[]): Promise<{ rows: any[]; rowCount: number }>;
    end(): Promise<void>;
    on(event: string, listener: (...args: any[]) => void): this;
  }
}
