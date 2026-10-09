/**
 *  Copyright (c) 2025 taskylizard. Apache License 2.0.
 *  Modified for BlogR Directory, 2026.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *  http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

import { replaceUnderscore, transformer } from './transformer/core'

export const transformGuide = (text: string): string =>
  transformer(text)
    .transform('Beginners Guide', [
      {
        name: 'TOC',
        find: /\[TOC\]\n/gm,
        replace: ''
      },
      {
        name: 'TOC2',
        find: /\*\*Table of Contents\*\*\n\[TOC2\]\n/gm,
        replace: ''
      },
      {
        name: 'Beginners Guide',
        find: /# -> \*\*\*Beginners Guide to Piracy\*\*\* <-\n/gm,
        replace: ''
      },
      {
        name: 'Note',
        find: /!!!note\s(.+?)\n/gm,
        replace: '\n:::info\n$1\n:::\n'
      },
      {
        name: 'Info',
        find: /!!!info\s(.+?)\n/gm,
        replace: '\n:::info\n$1\n:::\n'
      },
      {
        name: 'Warning',
        find: /!!!warning\s(.+?)\n/gm,
        replace: ':::warning\n$1\n:::\n'
      },
      {
        name: 'Quote',
        find: />\s(.+?)\n/gm,
        replace: '> $1\n\n'
      },
      {
        name: 'Back to Top',
        find: /\*\*\[\^ Back to Top\]\(#beginners-guide-to-piracy\)\*\*/gm,
        replace: ''
      },
      {
        name: 'Back to Top',
        find: /\*\*\[\^ Back to Top\]\(#beginners-guide-to-piracy\)\*\*/gm,
        replace: ''
      }
    ])
    .getText()

export function transform(text: string): string {
  let _text = text
    // Remove extra characters
    .replace(/\/#wiki_/g, '/#')
    .replace(/#wiki_/g, '/#')
    .replace(/.25BA_/g, '')
    .replace(/.25B7_/g, '')
    .replace(/_?\.2F_?/g, '-')
    .replace(/_?.26amp.3B_?/g, '-')
    .replace(
      /\*\*\[Table of Contents\]\(https?:\/\/.*?ibb\.co.*\)\*\* - For mobile users\n/gm,
      ''
    )
    // Remove extra lines
    .replace(/\*\*\*\n\*\*\*\n\*\*\*\n\*\*\*\n\n\n\*\*\*\n\*\*\*\n\n/gm, '')
    .replace(/\*\*\*\n\*\*\*\n\*\*\*\n\*\*\*\n\n\n\*\*\*\n\*\*\* \n\n/gm, '')
    .replace(/\*\*\*\n\*\*\*\n\*\*\*\n\n\n\*\*\*\n\*\*\*\n\n/gm, '')
    .replace(/\*\*\*\n\*\*\*\n\*\*\*\n\*\*\*\n\n\n\*\*\*\n\n/gm, '')
    .replace(/\*\*\*\n\*\*\*\n\n\n\*\*\*\n\n/gm, '')
  _text = replaceUnderscore(_text)
    .replace(/\/#(\d)/g, '/#_$1') // Prefix headings starting with numbers
    .replace(/#(\d)/g, '#_$1') // Prefix headings starting with numbers
    .replace(/(\]\(\s*)\/\s*(\#[^)\s]*?\s*\))/g, '$1$2')
    .replace(/\*\*\*\n\n/gm, '')
    .replace(/\*\*\*\n/gm, '')
    .replace(/# ►/g, '##')
    .replace(/## ▷/g, '###')
    .replace(/####/g, '###')
    // Replace emojis
    .replace(/⭐/g, ':star:')
    .replace(/🌟/g, ':glowing-star:')
    .replace(/🌐/g, ':globe-with-meridians:')
    .replace(/↪/g, ':repeat-button:')
    // Replace note/warning/tip
    .replace(/^\*\*Note\*\* - (.+)$/gm, ':::tip\n$1\n:::')
    .replace(/^\* \*\*Note\*\* - (.+)$/gm, ':::tip\n$1\n:::')
    .replace(/^Note - (.+)$/gm, ':::tip\n$1\n:::')
    .replace(/^\*\*Warning\*\* - (.+)$/gm, ':::warning\n$1\n:::')
    .replace(/^\* \*\*Warning\*\* - (.+)$/gm, ':::warning\n$1\n:::')
    .replace(/^\*\s([^*])/gm, '- $1')

  return _text
}
