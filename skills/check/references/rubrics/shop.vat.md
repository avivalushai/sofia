# Rubric: shop.vat — VAT and shipping calculated correctly

A wrong VAT rate or a total that changes at the last step costs money: either the business pays the difference to the tax authority, or customers feel cheated and abandon the purchase. In Israel, VAT is 18% since January 2025 (it was 17% before), and prices shown to consumers must already include VAT.

If the site sells only outside Israel, judge question 1 by the seller's own country and say which in the `why`.

Read the files you were given: anything that computes prices, totals, tax or shipping, on the server and in the cart.

1. **Is VAT applied at the current rate?**
   Fail: a hard-coded 17% (`0.17`, `1.17`, `VAT = 17`) for Israel, or a rate that matches no current rate.
   Pass: 18% for Israel (or the right rate elsewhere), ideally from one setting or the payment provider's tax feature.
2. **Is the price a consumer sees the price they pay?**
   Fail: products are shown without VAT and VAT is added only at checkout (in Israel, consumer prices must include VAT); a total at the last step that differs from the cart without saying why.
   Pass: prices include VAT everywhere, or (for business customers only) are clearly marked "+ VAT" from the start.
3. **Is VAT computed once, on the right amount, and rounded at the end?**
   Fail: VAT added on a price that already includes it; VAT on the pre-discount price; rounding each line in a way that makes the total wrong by agorot.
   Pass: one calculation on the final amount, rounded to 2 decimals at the end.
4. **Is shipping added before payment, and shown?**
   Fail: shipping added on the payment page without having been shown, or left out of the VAT calculation when it should be in it. "Doesn't apply" when nothing is shipped: answer `pass` and say so.
   Pass: shipping shown in the cart and included in the total and the VAT.

Findings: one for each problem, with file and line. Options: (1) fix the calculation and put the rate in one setting (recommended); (2) let the payment provider calculate tax; (3) keep it as it is.
