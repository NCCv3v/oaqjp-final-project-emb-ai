# Chasen · Hong Kong matcha & hojicha

A phone-sized map for matcha and hojicha in Hong Kong. It is a browser preview you can save to an iPhone home screen. This environment cannot compile or sign an App Store binary.

Open `index.html` through a local server so the map and modules load:

```bash
python3 -m http.server 8765
```

Then visit `http://127.0.0.1:8765/`.

On an iPhone: Safari → Share → Add to Home Screen.

The older emotion-detection template in `templates/` is untouched.

## What is inside

- A map of specialist cafes, one neighbourhood cup, and THE MATCHA TOKYO mall counters.
- Pins drawn as powder, tea, and a whisk. Matcha is green. Hojicha is roasted amber. Shops that pour both show both.
- Matcha / hojicha filters, districts, open-now, near me, and three walking routes.
- A tasting page for published grade tastings, usucha beside koicha, and the Hotel ICON regional afternoon tea. A named matcha-drink omakase was not found.
- A powder shelf with intro, origin, grade, sourcing, score, ranking, cultivar, flavour, and price in HKD per gram.
- English, Traditional Chinese, and Dutch.
- Saves, personal notes, a three-tin compare, a home-bowl cost, and a whisk guide. Those stay in this browser.

Prices are converted list prices (US$1 = HK$7.80, ¥1 = HK$0.052) dated 2 October 2026. They are not a receipt from a Hong Kong shelf. Hours change.

Check the data with:

```bash
node tests/check.mjs
```
