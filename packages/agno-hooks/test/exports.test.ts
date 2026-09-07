import { expect, test } from 'bun:test'
import * as hooks from '../src'

test('runtime exports are exactly the documented ones', () => {
  expect(Object.keys(hooks).sort()).toEqual([
    'AgnoProvider', 'confirm', 'createAgnoStore', 'fromServerStatus', 'isTerminal', 'isToolPending', 'pendingTools',
    'provideUserFeedback', 'provideUserInput', 'reject', 'setExternalResult', 'useAgnoAgent', 'useAgnoApi', 'useAgnoTeam', 'useAgnoWorkflow',
  ])
})
