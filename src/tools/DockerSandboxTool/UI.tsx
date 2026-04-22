import * as React from 'react'
import { Text, Box } from 'ink'

export function renderToolUseMessage(input: { command?: string }) {
  return (
    <Box>
      <Text color="yellow">🐳 Docker Sandbox: </Text>
      <Text bold>{input.command || 'Running docker command...'}</Text>
    </Box>
  )
}

export function renderToolResultMessage(result: {
  success?: boolean
  error?: string
  stdout?: string
  stderr?: string
}) {
  if (result.error) {
    return (
      <Box flexDirection="column">
        <Text color="red">❌ Docker Error: {result.error}</Text>
        {result.stderr && <Text color="gray">{result.stderr}</Text>}
      </Box>
    )
  }
  return (
    <Box flexDirection="column">
      <Text color="green">✅ Success</Text>
      {result.stdout && <Text>{result.stdout}</Text>}
    </Box>
  )
}

export function renderToolUseRejectedMessage() {
  return <Text color="red">Docker command rejected</Text>
}
