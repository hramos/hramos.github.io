# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- `npm run dev` / `npm start` - Start development server
- `npm run build` - Type check with `astro check` then build for production
- `npm run preview` - Preview production build locally
- `npm run lint` - Run ESLint on all JS/TS/Astro files
- `npm run lint:fix` - Auto-fix ESLint issues
- `npm run format` - Format code with Prettier
- `npm run format:check` - Check code formatting without changes

## Architecture Overview

This is an Astro-based personal blog/portfolio site using TypeScript and TailwindCSS. The project follows Astro's content collections pattern for blog management.

### Core Structure

- **Content Management**: Uses Astro Content Collections with type-safe frontmatter schemas in `src/content/config.ts`
- **Blog Posts**: Markdown/MDX files in `src/content/blog/` with corresponding cover images in `src/assets/blogimages/<slug>/`
- **Layouts**: Base layouts in `src/layouts/` including `BaseLayout.astro` and `BlogPostLayout.astro`
- **Site Configuration**: Global constants and navigation links defined in `src/consts.ts`

### Custom Plugins

The site uses custom Remark plugins for enhanced blog functionality:
- `src/plugins/remark-reading-time.mjs` - Adds reading time calculation to blog posts
- `src/plugins/remark-modified-time.mjs` - Tracks last modification dates

### Blog Post Requirements

When creating blog posts:
- Add markdown file to `src/content/blog/` (filename becomes URL slug)
- Include cover image at `src/assets/blogimages/<slug>/cover.jpg` (recommended: 853x480px)
- Use schema-defined frontmatter: `title`, `description`, `pubDate`, optional `updatedDate` and `coverImageCredit`
- Reference images with path `../../assets/blogimages/<slug>/imagename.ext` for caption support

### Integrations

- **MDX**: For enhanced markdown with React components
- **Sitemap**: Automatic sitemap generation
- **Partytown**: For optimized third-party script loading
- **Astro Icon**: Icon system
- **RSS**: Feed generation via `src/pages/rss.xml.js`

### Styling

- TailwindCSS v4 with Vite plugin
- Typography plugin for blog content styling
- Custom fonts: Inter (variable), JetBrains Mono (variable), Silkscreen

The site is configured for deployment to GitHub Pages with base URL handling via `SITE_BASE` constant.