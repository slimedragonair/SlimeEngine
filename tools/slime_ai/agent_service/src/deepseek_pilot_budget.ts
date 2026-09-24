import { ProviderTurnError } from './provider_events.ts';

// Peak Flash rates checked 2026-09-24. Reserve the full output allowance and
// twice the outbound text byte count before each network attempt. Images add
// DeepSeek's documented 1024-token per-image upper bound.
export const DEEPSEEK_PILOT_RATE = Object.freeze({
  source: 'https://api-docs.deepseek.com/quick_start/pricing/', checked_utc: '2026-09-24',
  input_nanodollars_per_token: 300, output_nanodollars_per_token: 1200,
});

export class DeepSeekPilotBudget {
  readonly maxAttempts = 12;
  readonly maxToolCalls = 24;
  readonly maxNanodollars = 2_000_000_000;
  private attempts = 0;
  private toolCalls = 0;
  private reservedNanodollars = 0;

  reserve(body: Record<string, unknown>, hasImage: boolean): void {
    const textBody = JSON.stringify(body, (key, value: unknown) =>
      key === 'url' && typeof value === 'string' && value.startsWith('data:image/png;base64,') ? '[approved-inline-image]' : value);
    const output = body.max_tokens;
    if (!Number.isSafeInteger(output) || Number(output) < 64 || Number(output) > 4096) {
      throw new ProviderTurnError('RUN_LIMIT', 'Unsupported output allowance.');
    }
    const inputTokens = 2 * Buffer.byteLength(textBody, 'utf8') + (hasImage ? 1024 : 0);
    const reserve = inputTokens * DEEPSEEK_PILOT_RATE.input_nanodollars_per_token + Number(output) * DEEPSEEK_PILOT_RATE.output_nanodollars_per_token;
    if (!Number.isSafeInteger(reserve) || this.attempts >= this.maxAttempts || this.reservedNanodollars + reserve > this.maxNanodollars) {
      throw new ProviderTurnError('RUN_LIMIT', 'DeepSeek pilot attempt or $2 reservation limit reached.');
    }
    this.attempts++;
    this.reservedNanodollars += reserve;
  }

  recordToolCall(): void {
    if (this.toolCalls >= this.maxToolCalls) throw new ProviderTurnError('RUN_LIMIT', 'DeepSeek pilot tool-call limit reached.');
    this.toolCalls++;
  }

  status(): object {
    return { attempts: this.attempts, max_attempts: this.maxAttempts,
      tool_calls: this.toolCalls, max_tool_calls: this.maxToolCalls,
      reserved_nanodollars: this.reservedNanodollars, max_nanodollars: this.maxNanodollars,
      rate_source: DEEPSEEK_PILOT_RATE.source, rate_checked_utc: DEEPSEEK_PILOT_RATE.checked_utc };
  }
}
