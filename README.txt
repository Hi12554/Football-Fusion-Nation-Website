FFN site setup
==============

Your site is plain files (no server needed), so any free host works.

Editing your site
-----------------
1. Open admin.html (on your live site at yoursite.com/admin.html, or from this
   folder through a local server, see below).
2. Add teams, games, and schedule entries. Use the League picker to switch
   leagues. RCFL is the only league right now; add more on the Leagues tab.
3. Click "Download config.js".
4. Upload that file to your host, replacing js/config.js. Refresh your site.

Your edits are saved in your browser as a draft until you download. The admin
page can't publish anything by itself, so it's safe if someone finds it, but
you can also just not upload admin.html (or the css/admin.css and js/admin.js
files) and keep it on your computer only.

First-time setup
----------------
- Site settings tab: paste your channel ID (starts with UC; YouTube Studio >
  Settings > Channel > Advanced settings) and your channel link. The channel ID
  is what lets the live stream play on the site.
- Games: paste the YouTube link for each game. Scores are optional.
- Schedule: times are entered in your computer's time zone. Visitors see
  their own time zone.

Test it locally
---------------
YouTube embeds won't play if you double-click index.html (file://). Run:
    python3 -m http.server 8000
then open http://localhost:8000 (and http://localhost:8000/admin.html).

Put it online
-------------
Netlify (drag the folder onto app.netlify.com/drop), Cloudflare Pages, or
GitHub Pages. To update later, re-upload just js/config.js.

Direct links
------------
yoursite.com/#v=VIDEO_ID opens that game. yoursite.com/#league=rcfl opens a
league.
