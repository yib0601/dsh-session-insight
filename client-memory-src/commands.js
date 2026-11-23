/**
 * 客户端命令调用层：所有 `remote.commands.execute` 只走这里。
 *
 * 三件事必须集中在一处，否则每个调用点都会各漏一项：
 *  - 超时/取消（宿主 RPC 不返回时不能把面板永久锁死）；
 *  - 信封解析（宿主 `{ok:false,error}` 与 `{ok:true,value}` 是两种形状）；
 *  - 错误归一（调用点只关心 ok/text/error，不重复猜）。
 */
import { service } from './services.js';
function errorText(value) {
    if (typeof value === 'string')
        return value;
    if (value && typeof value === 'object') {
        const record = value;
        if (typeof record.message === 'string' && record.message)
            return record.message;
        if (typeof record.code === 'string' && record.code)
            return record.code;
    }
    return '';
}
/**
 * 执行一条 `/tasks` 命令。
 * @param ctx client 上下文（服务一律软探测）
 * @param sessionId 当前会话；为空表示没有可用数据通道
 * @param line 完整命令行（以 `/tasks` 开头）
 * @param timeoutMs 超时；到点 abort，调用方拿到可重试的错误态
 */
export async function invokeCommand(ctx, sessionId, line, timeoutMs = 15_000) {
    const commands = service(ctx, 'remote.commands');
    if (!sessionId || !commands || typeof commands.execute !== 'function') {
        return { ok: false, text: '', error: 'no-channel' };
    }
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
        const response = await commands.execute(sessionId, line, [], controller?.signal);
        const envelope = response && typeof response === 'object' ? response : null;
        if (envelope && envelope.ok === false) {
            return { ok: false, text: '', error: errorText(envelope.error) || 'command rejected' };
        }
        const execution = envelope && 'value' in envelope ? envelope.value : envelope;
        if (execution === undefined || execution === null) {
            return { ok: false, text: '', error: 'unknown or malformed command' };
        }
        const result = execution.result ?? execution;
        if (result?.kind === 'error') {
            return { ok: false, text: '', error: String(result.text ?? 'command error') };
        }
        return { ok: true, text: typeof result?.text === 'string' ? result.text : '' };
    }
    catch (err) {
        const aborted = controller?.signal.aborted === true;
        return { ok: false, text: '', error: aborted ? 'command timed out' : String(err?.message ?? err) };
    }
    finally {
        if (timer !== null)
            clearTimeout(timer);
    }
}
