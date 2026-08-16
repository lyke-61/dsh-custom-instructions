/**
 * dsh-custom-instructions — host face.
 *
 * 通用设置“自定义指令”面板的服务端：
 *   GET  /custom-instructions         读取 ~/.dsh/AGENTS.md 内容
 *   POST /custom-instructions         以 JSON body { content } 整体写回
 *
 * 文件路径来自 @deepseek-ai/dsh-home-paths，与 dsh-agent-instructions 读取的
 * 用户全局文件一致：面板改的就是所有会话（不限模型）都会注入的全局指令。
 */

import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import { readFile, stat, writeFile } from 'node:fs/promises'

export const name = 'dsh-custom-instructions'

/** 服务要求：webServer 提供读写端点。 */
export const inject = ['webServer']

/** 用户全局指令文件：$DSH_HOME/AGENTS.md（与 dsh-agent-instructions 一致）。 */
const FILE_PATH = dshHomePath('AGENTS.md')

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' }

async function readInstructions() {
  try {
    const info = await stat(FILE_PATH)
    if (!info.isFile()) return ''
    return await readFile(FILE_PATH, 'utf8')
  } catch (error) {
    if (error && error.code === 'ENOENT') return ''
    throw error
  }
}

async function readBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

function sendJson(res, status, body) {
  res.writeHead(status, JSON_HEADERS)
  res.end(JSON.stringify(body))
}

export function apply(ctx) {
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/custom-instructions',
    handler: async (req, res) => {
      if (req.method === 'GET' || req.method === 'HEAD') {
        try {
          const content = await readInstructions()
          sendJson(res, 200, { ok: true, path: FILE_PATH, content })
        } catch (error) {
          sendJson(res, 500, { ok: false, error: String((error && error.message) || error) })
        }
        return
      }
      if (req.method === 'POST' || req.method === 'PUT') {
        try {
          const raw = await readBody(req)
          let content = ''
          try {
            const parsed = JSON.parse(raw)
            content = parsed && typeof parsed.content === 'string' ? parsed.content : ''
          } catch { /* 空或非 JSON body 按空内容处理 */ }
          await writeFile(FILE_PATH, content, 'utf8')
          sendJson(res, 200, { ok: true, path: FILE_PATH })
        } catch (error) {
          sendJson(res, 500, { ok: false, error: String((error && error.message) || error) })
        }
        return
      }
      res.writeHead(405)
      res.end()
    },
  }), 'dsh-custom-instructions: web routes')
}
