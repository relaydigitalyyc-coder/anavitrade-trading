# Zort.com Design Analysis

## Fonts
- Primary: DM Sans (400, 500, 700)
- Secondary/Headings: Inter (600, 700)

## Colors (from visual inspection)
- Background: Very dark navy/charcoal (#0d1117 or similar)
- Text: White/light gray
- Accent: Green (#00c853 or similar neon green)
- Cards: Dark gray with subtle borders
- Chart line: Green gradient

## Layout Structure
1. **Nav**: Logo left, Product/Company dropdowns center, App Store buttons right
2. **Hero**: Left text (headline + subtitle + app buttons), Right side has interactive trading widget
3. **About Section**: "ABOUT ZORT" label, 3 cards (Automate, Simplify, Scale) with icons
4. **Why Choose**: 3 feature cards with icons (Automated Simplicity, Security & Control, Smarter Technology)
5. **Strategy**: Flow diagram showing how the algorithm works
6. **How It Works**: 3 steps with illustrations (Buy Crypto, Connect, Automated Profit)
7. **Testimonials**: Carousel with user quotes
8. **FAQ**: Accordion style
9. **Footer**: Logo, nav links, social icons

## Interactive Widget (Hero)
- Dark card with rounded corners
- Sliders: Default Take Profit, Default Stop Loss, Trading Allocation (all 50%)
- Tabs: Balance | Portfolio | Fixed
- Portfolio Balance display: large number + chart
- Time range buttons: 1H, 1D, 1W, 1M, 1Y, All
- Trade list: Open | Closed tabs with ETH/USD, LTC/BTC entries

## Design Patterns
- Vue.js based (we'll use React)
- Normalize.css reset
- Section-based scrolling
- Green accent on dark background
- Rounded cards with subtle shadows
- Clean, modern fintech aesthetic
