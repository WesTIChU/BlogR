# BlogR Directory Third-Party Notices

This document records third-party licences and attribution relevant to the BlogR Directory source and generated site. It does not replace the Apache License 2.0 files in `LICENSE` and `docs/.vitepress/LICENSE`.

## Inter font software

The bundled files under `docs/.vitepress/fonts/` are Inter font files used by the site and Open Graph generator:

- Inter-Regular.otf
- Inter-Medium.otf
- Inter-SemiBold.otf
- Inter-Bold.otf

Copyright (c) 2016 The Inter Project Authors. The Inter Font Software is licensed under the SIL Open Font License, Version 1.1.

Authoritative source and licence: <https://github.com/rsms/inter/blob/master/LICENSE.txt>

The exact upstream release used for the bundled OTF files is not recorded in this repository. The files have not been modified by BlogR; verify the source release if a reproducible asset manifest is required.

### SIL Open Font License 1.1

```text
Copyright (c) 2016 The Inter Project Authors

This Font Software is licensed under the SIL Open Font License, Version 1.1.
This license is copied below, and is also available with a FAQ at:
http://scripts.sil.org/OFL

-----------------------------------------------------------
SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007
-----------------------------------------------------------

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free
and open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded,
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply to
any document created using the fonts or their derivatives.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name
as presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any
Modified Version, except to acknowledge the contribution(s) of the
Copyright Holder(s) and the Author(s) or with their explicit written
permission.

5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license.

THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT.
```

The complete authoritative licence, including the remaining disclaimer and termination text, is available at the source URL above.

## Twemoji graphics

BlogR uses `@iconify-json/twemoji` through `docs/.vitepress/markdown/emoji.ts`. The generated CSS icon classes are based on Twemoji graphics; no BlogR artwork is claimed for those graphics.

**Twemoji graphics — Copyright 2019 Twitter, Inc. and other contributors. Licensed under CC-BY 4.0.** BlogR uses the graphics through the Iconify collection and does not claim to have modified the graphics.

- Project: <https://github.com/twitter/twemoji>
- Graphics licence: <https://creativecommons.org/licenses/by/4.0/>
- Twemoji attribution guidance: <https://github.com/twitter/twemoji#attribution-requirements>

The Twemoji project states that a mention in a project README, About section, footer, or HTML/JS source is an acceptable attribution context. This notice provides that attribution without changing the site UI.

## Catppuccin logo preview

The optional Catppuccin theme preview references the Catppuccin-hosted logo URL from `docs/.vitepress/theme/themes/configs/catppuccin.ts`. The logo is upstream artwork, not BlogR artwork.

**Catppuccin logo — Copyright (c) 2021 Catppuccin. Licensed under the MIT License.**

- Project: <https://github.com/catppuccin/catppuccin>
- Referenced logo: <https://raw.githubusercontent.com/catppuccin/catppuccin/main/assets/logos/exports/1544x1544_circle.png>
- Licence: <https://github.com/catppuccin/catppuccin/blob/main/LICENSE>

## Iconify collections

The direct icon collection packages used by the source report these package licences:

- Carbon: Apache-2.0
- Fluent, Fluent UI MDL2, Gravity UI, Phosphor, and Qlementine Icons: MIT
- Logos and Simple Icons: CC0-1.0
- Lucide: ISC
- Material Symbols and MDI: Apache-2.0

These collections are used through Iconify/UnoCSS class generation. The package licence metadata is retained in the package installations and lockfile. This document records the direct collection obligations; it is not a complete notice for every transitive npm dependency.

## Apache-licensed inherited code

Retained FMHY/taskylizard-derived code is covered by the complete Apache License 2.0 copies at `LICENSE` and `docs/.vitepress/LICENSE`. Original notices remain in the applicable source files. Files modified for BlogR carry a `Modified for BlogR Directory, 2026.` notice where the inherited source comparison established a modified retained file.
