# bg_github

Small phone-friendly web apps, published with GitHub Pages at https://briangooding.github.io/bg_github/

| App | Folder | Live |
|---|---|---|
| Golden Hour: countdown, sun map and reminders for golden hour where you are | [`golden-hour/`](golden-hour/) | https://briangooding.github.io/bg_github/golden-hour/ |
| Projects Gallery: tiered masonry of every page under briangooding.com/projects/ | [`projects-gallery/`](projects-gallery/) | https://briangooding.github.io/bg_github/projects-gallery/ |
| Nearby Owners: flags non owner-occupied homes near you in Tarrant County | [`nearby-owners/`](nearby-owners/) | https://briangooding.github.io/bg_github/nearby-owners/ |

The root `index.html` links to the apps. The root `sw.js` only exists to remove the
service worker Golden Hour registered when it lived at the root.

## Projects Gallery

`projects-gallery/` reads the WordPress REST API of briangooding.com in the browser: it finds the
page with the slug `projects`, then every published sub-page up to three levels down. Projects
(direct children) are wide picture cards, their sub-pages narrow picture cards, and anything deeper
compact text cards. Pictures come from each page's featured image, else the first image in the page.

To show it on briangooding.com itself, add a Custom HTML block to a page with:

```html
<link rel="stylesheet" href="https://briangooding.github.io/bg_github/projects-gallery/gallery.css">
<div id="projects-gallery" data-parent="projects"></div>
<script src="https://briangooding.github.io/bg_github/projects-gallery/gallery.js"></script>
```

On the site it reads from the same site. Elsewhere, `?site=` and `?parent=` point it at another
WordPress site or parent page.
