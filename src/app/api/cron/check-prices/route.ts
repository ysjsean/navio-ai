import { NextRequest, NextResponse } from "next/server";
import { getAllWatches, updateWatchBaseline } from "@/lib/price-watch";
import { fetchTinyFish } from "@/lib/tinyfish";
import { sendTelegramMessage } from "@/lib/telegram";

// Called daily by Vercel Cron. Secured with CRON_SECRET.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const watches = await getAllWatches();
  const results: { watchId: string; dropped: boolean; error?: string }[] = [];

  for (const watch of watches) {
    try {
      const listings = await fetchTinyFish({
        area: watch.area,
        budget: watch.budget,
        dates: watch.dates,
      });

      const updatedBaseline = { ...watch.baseline };
      let notified = false;

      // Check best overall
      if (watch.baseline.bestOverall) {
        const current = listings.find(
          (l) => l.name === watch.baseline.bestOverall!.name
        );
        if (current && current.price < watch.baseline.bestOverall.price) {
          const drop = watch.baseline.bestOverall.price - current.price;
          const pct = Math.round((drop / watch.baseline.bestOverall.price) * 100);

          await sendTelegramMessage(
            watch.chatId,
            `🏨 <b>Price Drop!</b>\n\n${current.name}\nWas: $${watch.baseline.bestOverall.price} → Now: $${current.price}/night (−${pct}%)\n\n<a href="${current.url}">Book now</a>`
          );

          updatedBaseline.bestOverall = {
            name: current.name,
            price: current.price,
            url: current.url,
          };
          notified = true;
        }
      }

      // Check cheapest acceptable
      if (watch.baseline.cheapestAcceptable) {
        const current = listings.find(
          (l) => l.name === watch.baseline.cheapestAcceptable!.name
        );
        if (
          current &&
          current.price < watch.baseline.cheapestAcceptable.price &&
          !notified
        ) {
          const drop = watch.baseline.cheapestAcceptable.price - current.price;
          const pct = Math.round(
            (drop / watch.baseline.cheapestAcceptable.price) * 100
          );

          await sendTelegramMessage(
            watch.chatId,
            `🏨 <b>Price Drop!</b>\n\n${current.name}\nWas: $${watch.baseline.cheapestAcceptable.price} → Now: $${current.price}/night (−${pct}%)\n\n<a href="${current.url}">Book now</a>`
          );

          updatedBaseline.cheapestAcceptable = {
            name: current.name,
            price: current.price,
            url: current.url,
          };
        }
      }

      await updateWatchBaseline(watch.id, updatedBaseline);
      results.push({ watchId: watch.id, dropped: notified });
    } catch (err) {
      console.error(`Check failed for watch ${watch.id}:`, err);
      results.push({
        watchId: watch.id,
        dropped: false,
        error: String(err),
      });
    }
  }

  return NextResponse.json({ checked: results.length, results });
}
