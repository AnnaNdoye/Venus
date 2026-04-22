import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { execa, type ExecaError } from 'execa'
import { getCwdState } from '../../bootstrap/state.js'
import { renderToolUseMessage, renderToolResultMessage, renderToolUseRejectedMessage } from './UI.js'

const inputSchema = lazySchema(() =>
  z.strictObject({
    command: z
      .string()
      .describe('The shell command to execute securely within an isolated Docker container.'),
    timeout: z
      .number()
      .optional()
      .describe('Optional timeout in milliseconds.'),
    image: z
      .string()
      .optional()
      .describe('Docker image to use. Default is ubuntu:latest.')
  })
)
type InputSchema = ReturnType<typeof inputSchema>

const outputSchema = lazySchema(() =>
  z.object({
    success: z.boolean(),
    stdout: z.string().optional(),
    stderr: z.string().optional(),
    error: z.string().optional(),
  })
)
type OutputSchema = ReturnType<typeof outputSchema>

export type Input = z.infer<InputSchema>
export type Output = z.infer<OutputSchema>

export const DockerSandboxTool = buildTool({
  name: 'DockerSandbox',
  searchHint: 'execute shell commands securely in a docker sandbox',
  maxResultSizeChars: 100_000,
  strict: true,
  async description() {
    return 'Run shell commands safely inside an isolated Docker container. Mapped to current working directory.'
  },
  async prompt() {
    return 'Please provide the bash command to run inside the Docker sandbox.'
  },
  get inputSchema(): InputSchema {
    return inputSchema()
  },
  get outputSchema(): OutputSchema {
    return outputSchema()
  },
  userFacingName() {
    return 'Docker Sandbox'
  },
  isConcurrencySafe() {
    return false
  },
  isReadOnly(input: Input) {
    return false
  },
  toAutoClassifierInput(input) {
    return input.command
  },
  async checkPermissions(input: Input) {
    return {
      behavior: 'allow' as const,
      updatedInput: input,
    }
  },
  renderToolUseMessage,
  renderToolResultMessage,
  renderToolUseRejectedMessage,
  async call(input: Input, context): Promise<{ data: Output }> {
    const cwd = getCwdState()
    const image = input.image || 'ubuntu:latest'
    
    // Windows paths typically start with C:\, so Docker handles volume mapping well 
    // with -v "${cwd}:/workspace".
    try {
      // Create a long running background process if needed or just interactive transient.
      // -w /workspace sets working dir
      // -v ${cwd}:/workspace mounts the local directory
      const controller = new AbortController()
      if (input.timeout) {
         setTimeout(() => controller.abort(), input.timeout)
      }

      await execa('docker', ['info']) // Sanity check to see if docker is running

      const result = await execa(
        'docker',
        ['run', '--rm', '-v', `${cwd}:/workspace`, '-w', '/workspace', image, 'sh', '-c', input.command],
        {
          reject: false,
          cancelSignal: controller.signal
        }
      )

      return {
        data: {
          success: result.exitCode === 0,
          stdout: result.stdout,
          stderr: result.stderr,
          error: result.isCanceled ? 'Command timed out' : undefined
        }
      }
    } catch (err: any) {
      if (err.command && err.command.includes('docker info')) {
         return {
           data: {
             success: false,
             error: 'Docker is not running or not installed. Please start Docker Desktop.'
           }
         }
      }
      return {
        data: {
          success: false,
          error: String(err.message || err)
        }
      }
    }
  },
  mapToolResultToToolResultBlockParam(content: Output, toolUseID: string) {
    if (content.success) {
      const messages = []
      if (content.stdout) messages.push(`STDOUT:\n${content.stdout}`)
      if (content.stderr) messages.push(`STDERR:\n${content.stderr}`)
      return {
        tool_use_id: toolUseID,
        type: 'tool_result' as const,
        content: messages.join('\n\n') || 'Command executed successfully with no output.',
      }
    }
    return {
      tool_use_id: toolUseID,
      type: 'tool_result' as const,
      content: `Error: ${content.error}\nSTDERR: ${content.stderr || ''}`,
      is_error: true,
    }
  },
} satisfies ToolDef<InputSchema, Output>)
