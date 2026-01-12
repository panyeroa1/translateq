
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { FunctionResponseScheduling, Type } from '@google/genai';
import { FunctionCall } from './state';

export const AVAILABLE_TOOLS: FunctionCall[] = [
  {
    name: 'broadcast_to_websocket',
    description: 'ESSENTIAL FOR MULTI-USER SYNC: Sends the live transcription or translation text to an external display or participant websocket. Call this for every phrase produced to ensure remote listeners/viewers stay in sync.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        text: {
          type: Type.STRING,
          description: 'The verbatim text to broadcast to the global session.',
        },
      },
      required: ['text'],
    },
    isEnabled: true,
    scheduling: FunctionResponseScheduling.INTERRUPT,
  },
  {
    name: 'report_detected_language',
    description: 'Reports the detected source language for the current stream.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        language: {
          type: Type.STRING,
          description: 'The ISO name of the detected language.',
        },
      },
      required: ['language'],
    },
    isEnabled: true,
    scheduling: FunctionResponseScheduling.INTERRUPT,
  }
];
