from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "docs"
PNG_PATH = OUT_DIR / "custody_tracker_decision_tree.png"
JPG_PATH = OUT_DIR / "custody_tracker_decision_tree.jpg"

W, H = 3000, 2300
BG = "#f7f6f2"
INK = "#1f2933"
MUTED = "#5f6b7a"
LINE = "#8290a3"
BLUE = "#dceefe"
BLUE_EDGE = "#6aa9e9"
GREEN = "#def4e7"
GREEN_EDGE = "#65b984"
YELLOW = "#fff2c7"
YELLOW_EDGE = "#d8aa2c"
WHITE = "#ffffff"
GRAY = "#eef1f5"
RED = "#ffe3df"
RED_EDGE = "#d66b5d"
PURPLE = "#ece6ff"
PURPLE_EDGE = "#8975d9"


def font(size, bold=False):
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/Library/Fonts/Arial Bold.ttf" if bold else "/Library/Fonts/Arial.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ]
    for candidate in candidates:
        try:
            return ImageFont.truetype(candidate, size)
        except OSError:
            continue
    return ImageFont.load_default()


TITLE = font(58, True)
SUBTITLE = font(28)
HEADER = font(30, True)
BODY = font(25)
BODY_BOLD = font(25, True)
SMALL = font(21)


def text_size(draw, text, fnt):
    box = draw.textbbox((0, 0), text, font=fnt)
    return box[2] - box[0], box[3] - box[1]


def wrap(draw, text, fnt, max_width):
    words = text.split()
    lines = []
    current = ""
    for word in words:
        trial = f"{current} {word}".strip()
        if text_size(draw, trial, fnt)[0] <= max_width:
            current = trial
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def box(draw, xy, text, fill=WHITE, outline=LINE, fnt=BODY_BOLD, radius=24):
    x1, y1, x2, y2 = xy
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=4)
    lines = wrap(draw, text, fnt, x2 - x1 - 34)
    line_h = max(text_size(draw, "Ag", fnt)[1] + 8, 30)
    total_h = line_h * len(lines)
    y = y1 + ((y2 - y1) - total_h) / 2
    for line in lines:
        tw, th = text_size(draw, line, fnt)
        draw.text((x1 + ((x2 - x1) - tw) / 2, y), line, font=fnt, fill=INK)
        y += line_h


def label(draw, xy, text, fill, outline):
    x1, y1, x2, y2 = xy
    draw.rounded_rectangle(xy, radius=18, fill=fill, outline=outline, width=3)
    tw, th = text_size(draw, text, HEADER)
    draw.text((x1 + 22, y1 + ((y2 - y1) - th) / 2), text, font=HEADER, fill=INK)


def arrow(draw, start, end, color=LINE, width=4):
    x1, y1 = start
    x2, y2 = end
    draw.line((x1, y1, x2, y2), fill=color, width=width)
    dx = x2 - x1
    dy = y2 - y1
    if abs(dx) >= abs(dy):
        if dx >= 0:
            pts = [(x2, y2), (x2 - 18, y2 - 10), (x2 - 18, y2 + 10)]
        else:
            pts = [(x2, y2), (x2 + 18, y2 - 10), (x2 + 18, y2 + 10)]
    else:
        if dy >= 0:
            pts = [(x2, y2), (x2 - 10, y2 - 18), (x2 + 10, y2 - 18)]
        else:
            pts = [(x2, y2), (x2 - 10, y2 + 18), (x2 + 10, y2 + 18)]
    draw.polygon(pts, fill=color)


def elbow(draw, points, color=LINE):
    for a, b in zip(points, points[1:]):
        draw.line((a[0], a[1], b[0], b[1]), fill=color, width=4)
    arrow(draw, points[-2], points[-1], color=color)


def center_right(xy):
    return xy[2], (xy[1] + xy[3]) / 2


def center_left(xy):
    return xy[0], (xy[1] + xy[3]) / 2


def top_center(xy):
    return (xy[0] + xy[2]) / 2, xy[1]


def bottom_center(xy):
    return (xy[0] + xy[2]) / 2, xy[3]


def main():
    OUT_DIR.mkdir(exist_ok=True)
    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)

    draw.text((90, 58), "Custody Tracker Decision Tree", font=TITLE, fill=INK)
    draw.text(
        (92, 126),
        "Current check-in flow, including custody deviation context and diary/review endpoints.",
        font=SUBTITLE,
        fill=MUTED,
    )

    start = (110, 210, 360, 300)
    day_type = (470, 210, 760, 300)
    box(draw, start, "Home: Log today", fill=WHITE)
    box(draw, day_type, "What kind of day is it?", fill=WHITE)
    arrow(draw, center_right(start), center_left(day_type))

    # My day lane
    label(draw, (110, 390, 2860, 455), "My day", BLUE, BLUE_EDGE)
    my_day = (170, 515, 430, 600)
    my_actual = (530, 515, 850, 600)
    my_normal = (980, 405, 1235, 490)
    all_home = (1355, 405, 1665, 490)
    confirm_a = (1785, 405, 2095, 490)
    diary_a = (2215, 405, 2550, 490)
    review_a = (2645, 405, 2860, 490)
    co_helped = (980, 535, 1235, 620)
    pick_co = (1355, 535, 1665, 620)
    activity_co = (1785, 535, 2095, 620)
    kids_coparent = (980, 665, 1235, 750)
    pick_coparent = (1355, 665, 1665, 750)
    change_my = (1785, 665, 2095, 750)

    for xy, text, fill in [
        (my_day, "My day", BLUE),
        (my_actual, "Were the kids with you today?", WHITE),
        (my_normal, "I had the kids", WHITE),
        (all_home, "Are all kids sleeping at your house?", WHITE),
        (confirm_a, "Confirm each kid's location", GRAY),
        (diary_a, "Diary + optional screenshot", WHITE),
        (review_a, "Review", WHITE),
        (co_helped, "Co-parent helped", WHITE),
        (pick_co, "Pick kids co-parent helped with", WHITE),
        (activity_co, "For each kid: what did co-parent do?", WHITE),
        (kids_coparent, "Kids ended up with co-parent", RED),
        (pick_coparent, "Pick kids at co-parent tonight", WHITE),
        (change_my, "Schedule change context", PURPLE),
    ]:
        box(draw, xy, text, fill=fill)

    elbow(draw, [bottom_center(day_type), (615, 350), (300, 350), top_center(my_day)])
    arrow(draw, center_right(my_day), center_left(my_actual))
    elbow(draw, [center_right(my_actual), (910, 557), (910, 447), center_left(my_normal)])
    arrow(draw, center_right(my_normal), center_left(all_home))
    arrow(draw, center_right(all_home), center_left(confirm_a))
    arrow(draw, center_right(confirm_a), center_left(diary_a))
    arrow(draw, center_right(diary_a), center_left(review_a))
    arrow(draw, center_right(co_helped), center_left(pick_co))
    arrow(draw, center_right(pick_co), center_left(activity_co))
    elbow(draw, [center_right(activity_co), (2140, 577), (2140, 447), center_left(all_home)])
    elbow(draw, [center_right(my_actual), (910, 557), center_left(co_helped)])
    elbow(draw, [center_right(my_actual), (910, 557), (910, 707), center_left(kids_coparent)])
    arrow(draw, center_right(kids_coparent), center_left(pick_coparent))
    arrow(draw, center_right(pick_coparent), center_left(change_my))
    elbow(draw, [center_right(change_my), (2160, 707), (2160, 447), center_left(diary_a)])

    # Other parent's day lane
    label(draw, (110, 850, 2860, 915), "Other parent's day", GREEN, GREEN_EDGE)
    their_day = (170, 975, 430, 1060)
    their_actual = (530, 975, 850, 1060)
    co_had = (980, 865, 1235, 950)
    involvement = (1355, 865, 1665, 950)
    review_b = (1785, 865, 2095, 950)
    i_helped = (980, 995, 1235, 1080)
    pick_helped = (1355, 995, 1665, 1080)
    helped_activity = (1785, 995, 2095, 1080)
    confirm_b = (2215, 995, 2550, 1080)
    kids_me = (980, 1125, 1235, 1210)
    pick_me = (1355, 1125, 1665, 1210)
    change_their = (1785, 1125, 2095, 1210)
    diary_b = (2215, 1125, 2550, 1210)
    review_c = (2645, 1125, 2860, 1210)

    for xy, text, fill in [
        (their_day, "Other parent's day", GREEN),
        (their_actual, "Were the kids with your co-parent today?", WHITE),
        (co_had, "Co-parent had the kids", WHITE),
        (involvement, "Choose involvement: none, call, pickup, brief visit", WHITE),
        (review_b, "Review", WHITE),
        (i_helped, "I helped", WHITE),
        (pick_helped, "Pick kids you helped with", WHITE),
        (helped_activity, "For each kid: what did you do?", WHITE),
        (confirm_b, "Confirm each kid's location", GRAY),
        (kids_me, "Kids ended up with me", RED),
        (pick_me, "Pick kids who ended up with you", WHITE),
        (change_their, "Schedule change context", PURPLE),
        (diary_b, "Diary + optional screenshot", WHITE),
        (review_c, "Review", WHITE),
    ]:
        box(draw, xy, text, fill=fill)

    elbow(draw, [bottom_center(day_type), (615, 810), (300, 810), top_center(their_day)])
    arrow(draw, center_right(their_day), center_left(their_actual))
    elbow(draw, [center_right(their_actual), (910, 1017), (910, 907), center_left(co_had)])
    arrow(draw, center_right(co_had), center_left(involvement))
    arrow(draw, center_right(involvement), center_left(review_b))
    elbow(draw, [center_right(their_actual), (910, 1017), center_left(i_helped)])
    arrow(draw, center_right(i_helped), center_left(pick_helped))
    arrow(draw, center_right(pick_helped), center_left(helped_activity))
    arrow(draw, center_right(helped_activity), center_left(confirm_b))
    elbow(draw, [center_right(confirm_b), (2590, 1037), (2590, 1167), center_left(review_c)])
    elbow(draw, [center_right(their_actual), (910, 1017), (910, 1167), center_left(kids_me)])
    arrow(draw, center_right(kids_me), center_left(pick_me))
    arrow(draw, center_right(pick_me), center_left(change_their))
    arrow(draw, center_right(change_their), center_left(diary_b))
    arrow(draw, center_right(diary_b), center_left(review_c))

    # Special day lane
    label(draw, (110, 1310, 2860, 1375), "Special day", YELLOW, YELLOW_EDGE)
    special = (170, 1435, 430, 1520)
    special_diary = (530, 1435, 850, 1520)
    special_review = (980, 1435, 1235, 1520)
    saved = (1355, 1435, 1665, 1520)
    for xy, text, fill in [
        (special, "Special day", YELLOW),
        (special_diary, "Special-day diary + optional screenshot", WHITE),
        (special_review, "Review", WHITE),
        (saved, "Saved", WHITE),
    ]:
        box(draw, xy, text, fill=fill)
    elbow(draw, [bottom_center(day_type), (615, 1270), (300, 1270), top_center(special)])
    arrow(draw, center_right(special), center_left(special_diary))
    arrow(draw, center_right(special_diary), center_left(special_review))
    arrow(draw, center_right(special_review), center_left(saved))

    # Schedule change context detail
    draw.rounded_rectangle((110, 1640, 2860, 2180), radius=26, fill="#fbfbfd", outline=PURPLE_EDGE, width=4)
    draw.text((150, 1680), "Schedule Change Context Detail", font=HEADER, fill=INK)
    draw.text(
        (150, 1722),
        "Appears only when custody differs from the scheduled parent: my day -> kids with co-parent, or other parent's day -> kids with me.",
        font=SMALL,
        fill=MUTED,
    )

    c0 = (170, 1840, 490, 1935)
    c1 = (620, 1840, 960, 1935)
    c_yes = (1090, 1745, 1370, 1830)
    c_no = (1090, 1935, 1370, 2020)
    c2 = (1500, 1745, 1840, 1830)
    c_press = (1970, 1650, 2250, 1735)
    c_fine = (1970, 1840, 2250, 1925)
    c_notes = (2380, 1840, 2670, 1925)
    c_review = (2380, 2030, 2670, 2115)

    for xy, text, fill in [
        (c0, "Schedule change context", PURPLE),
        (c1, "Was this agreed to in advance?", WHITE),
        (c_yes, "Yes, agreed", WHITE),
        (c_no, "No, unexpected", WHITE),
        (c2, "Did you feel pressured to agree?", WHITE),
        (c_press, "Felt pressured", RED),
        (c_fine, "No, I was fine helping", GREEN),
        (c_notes, "Continue to notes", WHITE),
        (c_review, "Review", WHITE),
    ]:
        box(draw, xy, text, fill=fill)

    arrow(draw, center_right(c0), center_left(c1), color=PURPLE_EDGE)
    elbow(draw, [center_right(c1), (1020, 1887), (1020, 1787), center_left(c_yes)], color=PURPLE_EDGE)
    elbow(draw, [center_right(c1), (1020, 1887), center_left(c_no)], color=PURPLE_EDGE)
    arrow(draw, center_right(c_yes), center_left(c2), color=PURPLE_EDGE)
    elbow(draw, [center_right(c2), (1900, 1787), (1900, 1692), center_left(c_press)], color=PURPLE_EDGE)
    elbow(draw, [center_right(c2), (1900, 1787), (1900, 1882), center_left(c_fine)], color=PURPLE_EDGE)
    elbow(draw, [center_right(c_no), (2320, 1977), (2320, 1882), center_left(c_notes)], color=PURPLE_EDGE)
    arrow(draw, center_right(c_press), center_left(c_notes), color=PURPLE_EDGE)
    arrow(draw, center_right(c_fine), center_left(c_notes), color=PURPLE_EDGE)
    arrow(draw, bottom_center(c_notes), top_center(c_review), color=PURPLE_EDGE)

    draw.text((110, 2212), "Source: DECISION_TREE.md", font=SMALL, fill=MUTED)

    img.save(PNG_PATH)
    img.save(JPG_PATH, quality=92)
    print(PNG_PATH)
    print(JPG_PATH)


if __name__ == "__main__":
    main()
