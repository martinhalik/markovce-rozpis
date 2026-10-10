# Markovce Rozpis

Orthodox liturgical calendar and weekly schedule app for the parish of Markovce.

## Deploying a new version

`index.html` loads `style.css?v=…` and `script.js?v=…`. **Bump that `v` value (both tags) on every deploy.**
It is what makes every browser fetch the new files instead of a cached copy, and the app reads it
and shows it in the footer as *Verzia …* — if an iPhone and a Mac show different versions, one of
them is still on an old build (reload it; the `Cache-Control: no-cache` headers in `vercel.json`
make a plain reload enough).

Cross-device state lives on the server (`/api/sync`) and is pulled on page load, whenever the app
comes back into view, and every 5 minutes while it stays open. A device with no sync key shows an
orange *Bez synchronizácie – zadať kľúč* pill (tap it to enter the key); until a key is entered
that device is offline-only and will drift from the others.

## Icons

Icons are stored in `icons/` and registered in `icons/manifest.json`. The app loads the manifest at runtime — adding a new icon means: dropping the file in `icons/`, adding an entry to `manifest.json`, done.

Currently **99 icons** in the gallery.

## To Do — Missing Icons

Icons still needed for the following feasts/saints:

### Great Martyrs & Popular Saints
- [ ] St. Panteleimon the Great-Martyr (July 27)
- [ ] St. Paraskeva (Oct 14 / Nov 14)
- [ ] St. Barbara (Dec 4)
- [ ] St. Stephen the Protomartyr (Dec 27)
- [ ] St. Spyridon of Trimythous (Dec 12)
- [ ] St. James the Brother of the Lord (Oct 23)

### Theotokos Icons
- [ ] Theotokos of Vladimir (Vladimirskaya)
- [ ] Theotokos of Kazan
