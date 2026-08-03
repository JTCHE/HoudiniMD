import { expect, test } from 'bun:test';
import { convertToMarkdown } from './converter';

test('keeps a video and its caption in one figure', async () => {
  const markdown = await convertToMarkdown({
    title: 'Video test',
    summary: '',
    breadcrumbs: [],
    version: 'unknown',
    category: '',
    sourceUrl: 'https://www.sidefx.com/docs/houdini/ml/stages/',
    mainHtml: '<main><div id="content"><figure><video src="../videos/demo.webm" type="video/webm" controls></video><figcaption>Demo caption</figcaption></figure><table><tr><td><figure><video src="../videos/no-caption.webm" type="video/webm" controls></video></figure></td></tr></table></div></main>',
  });

  expect(markdown.match(/<video /g)).toHaveLength(2);
  expect(markdown).toContain('<video class="h-auto w-full rounded-lg" src="https://www.sidefx.com/docs/houdini/ml/videos/demo.webm" type="video/webm" controls preload="metadata"></video><figcaption');
  expect(markdown).toContain('<figcaption class="mt-2 text-left text-sm text-muted-foreground">Demo caption</figcaption>');
  expect(markdown).not.toContain('>Video<');
});
