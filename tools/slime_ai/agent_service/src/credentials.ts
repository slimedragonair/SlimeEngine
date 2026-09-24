import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ProfileId } from './provider_profiles.ts';

const execFileAsync = promisify(execFile);
const TARGETS: Partial<Record<ProfileId, { store: string; fallback: string }>> = {
  openai_responses: { store: 'SlimeEngine/OpenAI', fallback: 'SLIME_AI_OPENAI_API_KEY' },
  anthropic_messages: { store: 'SlimeEngine/Anthropic', fallback: 'SLIME_AI_ANTHROPIC_API_KEY' },
  deepseek_chat: { store: 'SlimeEngine/DeepSeek', fallback: 'SLIME_AI_DEEPSEEK_API_KEY' },
  kimi_chat: { store: 'SlimeEngine/Moonshot', fallback: 'SLIME_AI_MOONSHOT_API_KEY' },
  openrouter_chat: { store: 'SlimeEngine/OpenRouter', fallback: 'SLIME_AI_OPENROUTER_API_KEY' },
};

// The script and target name contain no secret. Credential bytes are returned
// through the private child pipe and are never included in errors or logs.
const READ_WINDOWS_CREDENTIAL = `
$type = @'
using System;
using System.Runtime.InteropServices;
public static class SlimeCredential {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct Credential {
    public UInt32 Flags; public UInt32 Type; public string TargetName;
    public string Comment; public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public UInt32 CredentialBlobSize; public IntPtr CredentialBlob; public UInt32 Persist;
    public UInt32 AttributeCount; public IntPtr Attributes; public string TargetAlias; public string UserName;
  }
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool CredRead(string target, UInt32 type, UInt32 flags, out IntPtr credential);
  [DllImport("advapi32.dll", SetLastError = true)]
  public static extern void CredFree(IntPtr credential);
}
'@
Add-Type -TypeDefinition $type
$pointer = [IntPtr]::Zero
if (-not [SlimeCredential]::CredRead($env:SLIME_AI_CREDENTIAL_TARGET, 1, 0, [ref]$pointer)) { exit 3 }
try {
  $record = [Runtime.InteropServices.Marshal]::PtrToStructure($pointer, [type][SlimeCredential+Credential])
  if ($record.CredentialBlobSize -lt 1 -or $record.CredentialBlobSize -gt 8192) { exit 4 }
  $bytes = New-Object byte[] $record.CredentialBlobSize
  [Runtime.InteropServices.Marshal]::Copy($record.CredentialBlob, $bytes, 0, $bytes.Length)
  $utf16 = $bytes.Length -ge 2 -and ($bytes.Length % 2) -eq 0 -and $bytes[1] -eq 0
  if ($utf16) { [Console]::Out.Write([Text.Encoding]::Unicode.GetString($bytes)) }
  else { [Console]::Out.Write([Text.Encoding]::UTF8.GetString($bytes)) }
} finally { [SlimeCredential]::CredFree($pointer) }
`;

export type CredentialStatus = 'connected' | 'missing';

export async function readProfileKey(profileId: ProfileId): Promise<string | null> {
  const target = TARGETS[profileId];
  if (!target) return null;
  if (process.platform === 'win32') {
    try {
      const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', READ_WINDOWS_CREDENTIAL],
        { encoding: 'utf8', timeout: 5000, maxBuffer: 16384, windowsHide: true, env: { SystemRoot: process.env.SystemRoot ?? 'C:\\Windows', SLIME_AI_CREDENTIAL_TARGET: target.store } });
      if (stdout.length > 0 && stdout.length <= 8192) return stdout;
    } catch { /* Missing store entry or unavailable PowerShell; use explicit development fallback. */ }
  }
  const fallback = process.env.SLIME_AI_DEV_CREDENTIAL_FALLBACK === '1' ? process.env[target.fallback] : undefined;
  return fallback && fallback.length <= 8192 ? fallback : null;
}

export function readOpenAIKey(): Promise<string | null> { return readProfileKey('openai_responses'); }

export async function profileCredentialStatus(profileId: ProfileId): Promise<CredentialStatus> {
  return (await readProfileKey(profileId)) ? 'connected' : 'missing';
}

export async function openAICredentialStatus(): Promise<CredentialStatus> {
  return profileCredentialStatus('openai_responses');
}
