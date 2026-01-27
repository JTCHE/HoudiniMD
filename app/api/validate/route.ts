import { NextRequest, NextResponse } from 'next/server';
import { checkPageExists, PageNotFoundError } from '@/lib/scraper';
import { toSideFXUrl } from '@/lib/url-normalizer';

export const dynamic = 'force-dynamic';

/**
 * Validate that a SideFX documentation page exists before navigating
 * GET /api/validate?slug=houdini/vex/functions/foreach
 */
export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get('slug');

  if (!slug) {
    return NextResponse.json(
      { valid: false, error: 'Missing slug parameter' },
      { status: 400 }
    );
  }

  const sideFXUrl = toSideFXUrl(slug);

  try {
    await checkPageExists(sideFXUrl);
    return NextResponse.json({ valid: true, slug, sourceUrl: sideFXUrl });
  } catch (error) {
    if (error instanceof PageNotFoundError) {
      return NextResponse.json(
        { valid: false, error: 'Page not found', slug, sourceUrl: sideFXUrl },
        { status: 404 }
      );
    }

    console.error(`Validation error for ${slug}:`, error);
    return NextResponse.json(
      { valid: false, error: 'Validation failed', slug },
      { status: 500 }
    );
  }
}
