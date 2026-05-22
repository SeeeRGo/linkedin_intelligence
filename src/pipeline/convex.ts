import path from "node:path";
import { pathToFileURL } from "node:url";
import { ConvexHttpClient } from "convex/browser";

export class ConvexGateway {
  private client: ConvexHttpClient | null;
  private apiPromise: Promise<Record<string, Record<string, unknown>>> | null = null;

  constructor(convexUrl: string) {
    this.client = convexUrl ? new ConvexHttpClient(convexUrl) : null;
  }

  isConfigured(): boolean {
    return Boolean(this.client);
  }

  private async api() {
    if (!this.apiPromise) {
      const generatedPath = pathToFileURL(path.resolve(process.cwd(), "convex/_generated/api.js")).href;
      this.apiPromise = import(generatedPath).then((module) => module.api as Record<string, Record<string, unknown>>);
    }
    return this.apiPromise;
  }

  private async functionRef(name: string) {
    const [namespace, functionName] = name.split(".");
    if (!namespace || !functionName) throw new Error(`Invalid Convex function name: ${name}`);
    const api = await this.api();
    const ref = api[namespace]?.[functionName];
    if (!ref) throw new Error(`Convex function not found: ${name}. Run "npm run convex:dev" to generate API bindings.`);
    return ref as never;
  }

  async query<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    if (!this.client) throw new Error("CONVEX_URL is not configured.");
    return this.client.query(await this.functionRef(name), args as never) as Promise<T>;
  }

  async mutation<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    if (!this.client) throw new Error("CONVEX_URL is not configured.");
    return this.client.mutation(await this.functionRef(name), args as never) as Promise<T>;
  }
}
