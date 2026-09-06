import { describe, expect, it } from 'vitest'
import { kindFromName, stripModuleSyntax } from '../apps/desktop/src/desktop/components/design/renderScreen'

describe('Remotion design source contract', () => {
  it('treats .tsx compositions as JSX renderables', () => {
    expect(kindFromName('logo-reveal.tsx')).toBe('jsx')
  })

  it('removes multiline Remotion imports while preserving the default component', () => {
    const source = `
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
} from 'remotion';

export default function LogoReveal() {
  const frame = useCurrentFrame();
  return <AbsoluteFill style={{opacity: interpolate(frame, [0, 10], [0, 1])}} />;
}
`
    const transformed = stripModuleSyntax(source)
    expect(transformed).not.toContain("from 'remotion'")
    expect(transformed).toContain('function LogoReveal')
    expect(transformed).toContain('__default = LogoReveal')
  })
})
