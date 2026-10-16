"""Generate the SYNTHETIC labelled dataset used to train PocketPilot's categoriser.

Every row is invented: a hand-written base phrase per category, expanded with
common payment-channel wrappers. Nothing comes from real people or accounts.
Rows from the same base phrase share a `group`, so validation can hold out whole
phrases (see train.py) instead of leaking near-duplicates into the validation set.
"""
import csv
import random
from pathlib import Path

from more_phrases import MORE

BASE = {
    "Food and groceries": [
        "lunch at campus cafeteria", "jollof rice and chicken", "buy groceries at the market", "suya at night",
        "noodles and egg breakfast", "bread and akara", "bag of rice 5kg", "tomatoes pepper and onions",
        "bottled water and snacks", "shawarma after lectures", "mama put lunch", "fried plantain and beans",
        "eba and egusi soup", "supermarket shopping foodstuff", "pack of indomie", "garri and groundnut",
        "meat pie and soft drink", "pounded yam and soup", "fruits from the roadside", "milk and cereal",
        "pizza with friends", "breakfast at the canteen", "provisions for the hostel", "fresh fish and crayfish",
        "chicken and chips", "cooking gas refill for kitchen food", "bukka lunch", "sachet water dozen",
        "yoghurt and biscuits", "restaurant dinner",
    ],
    "Transport": [
        "bus fare to university", "keke ride to campus", "uber to the mall", "bolt ride home", "okada to lecture hall",
        "danfo fare", "bus fare to lagos", "inter state park transport", "taxi to the airport", "fuel for the car",
        "bike ride to school gate", "brt ticket", "shuttle bus fare", "transport to hostel", "keke napep fare",
        "petrol 5 litres", "transport money to church", "ride share to town", "train ticket", "bus to the motor park",
        "okada man", "cab fare to the interview", "transport back to school", "inbolt ride", "ferry boat fare",
        "bus fare for industrial attachment", "parking fee", "transport to the market", "lift fare home", "travel fare to abuja",
    ],
    "Education and school expenses": [
        "course registration fee", "textbook for economics", "photocopy of lecture notes", "school fees installment",
        "departmental dues", "exam fee", "handout for chemistry", "printing assignment", "project binding and printing",
        "lab coat for practicals", "calculator for exams", "notebooks and pens", "tuition payment", "jamb practice app subscription",
        "library fine", "faculty levy", "past questions pack", "online course payment", "stationery from the bookshop",
        "scientific calculator", "thesis typing and printing", "school id card replacement", "acceptance fee", "matriculation gown",
        "udemy course", "extra lesson fee", "student union dues", "postgraduate form", "drawing materials for architecture", "clearance fee",
    ],
    "Accommodation and utilities": [
        "hostel fee", "house rent", "electricity token", "prepaid light unit", "nepa bill", "water bill for the apartment",
        "hostel maintenance levy", "rent for the off campus room", "generator fuel for the flat", "landlord rent installment",
        "dstv subscription", "gotv renewal", "waste disposal fee", "estate service charge", "buy bucket and mop for room",
        "mattress for the hostel", "bedsheet and pillow", "ikeja electric prepaid", "light bill", "caution deposit for room",
        "room repair and plumbing", "wifi router subscription", "kerosene for stove", "gas cylinder refill", "ekedc token",
        "mosquito net and curtain", "house cleaning service", "water tanker supply", "room rent balance", "hostel accommodation payment",
    ],
    "Airtime and data": [
        "mobile data subscription", "mtn airtime", "glo data bundle", "airtel 2gb data", "9mobile recharge",
        "buy 1000 naira airtime", "weekly data plan", "monthly data bundle", "recharge card", "mtn data 5gb",
        "airtime for mum", "spectranet data", "data for online classes", "night plan data", "top up my sim",
        "vtu airtime", "data to stream lectures", "smile 4g bundle", "glo recharge", "airtel airtime top up",
        "social media bundle", "buy data for zoom", "mtn pulse airtime", "internet subscription for phone", "airtime to call home",
        "2gb weekly bundle", "borrow airtime repayment", "data renewal", "recharge 500", "mtn xtratime data",
    ],
    "Health and personal care": [
        "pharmacy drugs", "malaria treatment", "campus clinic registration", "paracetamol and vitamin c", "haircut at the barber",
        "braiding hair", "hospital consultation", "body cream and soap", "toothpaste and toothbrush", "dental check up",
        "eye test and glasses", "sanitary pads", "deodorant and perfume", "salon appointment", "health insurance card",
        "antibiotics from the chemist", "lab test for typhoid", "shampoo and conditioner", "nail fixing", "medical check for admission",
        "cough syrup", "first aid items", "razor and aftershave", "skincare products", "gym membership",
        "relaxer and hair treatment", "doctor appointment", "hand sanitizer and face mask", "contact lens solution", "massage and spa",
    ],
    "Entertainment and leisure": [
        "cinema ticket", "netflix subscription", "football viewing centre", "birthday party contribution", "night club cover charge",
        "spotify premium", "game credit for ps5", "hangout at the lounge", "concert ticket", "show tickets for comedy night",
        "betting stake", "bowling with friends", "beach outing", "movie night snacks and tickets", "video game top up",
        "amusement park", "drinks at the bar", "owambe aso ebi", "youtube premium", "board games cafe",
        "festival entry", "dinner date", "karaoke night", "fifa tournament entry", "arcade games",
        "friend's wedding gift and party", "hotel for weekend getaway", "swimming pool fee", "paintball event", "campus carnival ticket",
    ],
    "Shopping": [
        "new sneakers", "jumia order", "t shirt and jeans", "phone case and screen guard", "wristwatch",
        "bag from balogun market", "ankara fabric for tailoring", "sunglasses", "earphones", "perfume gift set",
        "dress for the occasion", "shoes at the mall", "konga delivery", "thrift clothes", "powerbank",
        "laptop bag", "jewelry set", "online shopping order", "tailor charge for clothes", "wig and hair extension",
        "bluetooth speaker", "jacket and cap", "wallet and belt", "slippers", "gadget accessories",
        "pair of trousers", "fashion store purchase", "aliexpress order", "brand new phone charger", "underwear and socks",
    ],
    "Savings and transfers": [
        "transfer to savings", "moved money to my piggyvest", "own account transfer", "save for rainy day", "transfer to my kuda savings",
        "emergency fund top up", "moved to savings wallet", "transfer to my other account", "cowrywise savings", "weekly savings deposit",
        "transfer between my accounts", "lock funds in target savings", "savings contribution", "thrift contribution", "ajo contribution",
        "esusu monthly contribution", "move cash to fixed savings", "top up my savings box", "own wallet transfer", "transfer to self",
        "piggybank deposit", "savings plan debit", "transfer from current to savings", "put money aside", "auto save",
        "opay owealth deposit", "transfer to my second account", "savings for school fees", "safelock deposit", "cooperative society savings",
    ],
    "Other": [
        "gift for mum", "church offering", "donation to a friend in need", "bank charges", "sms alert charge",
        "pos withdrawal fee", "lend money to a friend", "fine paid", "miscellaneous", "unknown purchase",
        "tithe", "mosque donation", "contribution for class event", "money for sister", "stamp duty charge",
        "atm withdrawal", "paid a debt", "birthday gift for cousin", "help for a neighbour", "lost item replacement",
        "small business capital", "data entry gig expenses", "visa application fee", "courier service", "laundry service",
        "phone repair", "key duplicating", "passport photographs", "notary fee", "refund to friend",
    ],
}

WRAPPERS = [
    "{p}", "{p}", "{p} pos", "pos {p}", "{p} via opay", "{p} via kuda", "paid for {p}", "{p} N{amt}",
    "bought {p}", "{p} today", "{p} (moniepoint)", "{p} - palmpay",
]


def main() -> None:
    rng = random.Random(42)
    rows = []
    for category, phrases in {c: BASE[c] + MORE[c] for c in BASE}.items():
        for i, p in enumerate(phrases):
            group = f"{category[:3].lower()}-{i:02d}"
            variants = rng.sample(WRAPPERS, 5)
            for w in variants:
                amt = rng.choice([200, 500, 800, 1000, 1500, 2000, 3500, 5000, 12000])
                text = w.format(p=p, amt=amt)
                rows.append((text, category, group))
    rng.shuffle(rows)
    out = Path(__file__).parent / "data" / "transactions_synthetic.csv"
    out.parent.mkdir(exist_ok=True)
    with out.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["description", "category", "group"])
        w.writerows(rows)
    print(f"wrote {len(rows)} rows, {sum(len(BASE[c]) + len(MORE[c]) for c in BASE)} base phrases -> {out}")


if __name__ == "__main__":
    main()
