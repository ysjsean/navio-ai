import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { saveWatch } from "@/lib/price-watch";
import { sendTelegramMessage } from "@/lib/telegram";
import { Listing } from "@/types/hotel";

export async function POST(req: NextRequest) {
  try {
    const {
      chatId,
      area,
      dates,
      budget,
      bestOverall,
      cheapestAcceptable,
    }: {
      chatId: string;
      area: string;
      dates?: { checkin: string; checkout: string };
      budget?: string;
      bestOverall?: Listing;
      cheapestAcceptable?: Listing;
    } = await req.json();

    if (!chatId || !area) {
      return NextResponse.json(
        { error: "chatId and area are required" },
        { status: 400 }
      );
    }

    const id = randomUUID();

    await saveWatch({
      id,
      chatId,
      area,
      dates,
      budget,
      baseline: {
        bestOverall: bestOverall
          ? { name: bestOverall.name, price: bestOverall.price, url: bestOverall.url }
          : undefined,
        cheapestAcceptable: cheapestAcceptable
          ? { name: cheapestAcceptable.name, price: cheapestAcceptable.price, url: cheapestAcceptable.url }
          : undefined,
      },
      createdAt: Date.now(),
    });

    const baselineText = bestOverall
      ? `\n\nBaseline price:\n• <b>${bestOverall.name}</b>: $${bestOverall.price}/night`
      : "";

    await sendTelegramMessage(
      chatId,
      `✅ <b>Price watch set!</b>\n\nI'll notify you if prices drop for <b>${area}</b>.${baselineText}\n\nChecks run daily at 9 AM UTC.`
    );

    return NextResponse.json({ ok: true, watchId: id });
  } catch (error) {
    console.error("Failed to create watch:", error);
    return NextResponse.json(
      { error: "Failed to create price watch" },
      { status: 500 }
    );
  }
}
