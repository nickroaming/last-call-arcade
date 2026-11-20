# Online test (play from different places)

## How to play (the simple version)
1. **Xbox:** open Edge, go to **nickroaming.github.io/last-call-arcade/online-test.html**, press **A**.
2. **The TV shows a QR code and a 4-letter code.** Leave that screen up.
3. **Phones:** scan the QR code with the camera. Or open **nickroaming.github.io/last-call-arcade/join** and type the code.
4. **On the phone:** drag the stick, press **A**. Your numbered dot moves on the TV and in the video on your phone.
5. **PASS** in green on both screens means it works. Up to 8 players.

The phone needs no controller: it shows an on-screen stick plus A and B. A laptop can use a plugged-in controller or the keyboard (WASD + Space).

**Why the Xbox felt stuck (20 Nov):** the test page did not tell Xbox Edge to hand the controller to the page, so the controller only moved a mouse cursor and A did nothing. Fixed: A now hosts.

---

# Detailed test notes

**Goal:** find out whether your Xbox can stream the game to your brother and receive his controller, before we build it into the real game.
It takes about 10 minutes. You both need to be available at the same time (a phone call helps).

**Test page:** https://nickroaming.github.io/last-call-arcade/online-test.html

## First try (19 Nov): failed with "Error: network"
The phone that hosted lost its link to the free connection service (most likely the phone locked or the app was switched while sending the code). The old test page never reconnected, so the room vanished and the laptop could not find it.

**Fixed in the new version:**
- The room reconnects to the service on its own (tested: back in about 1.5 s after a forced drop). A drop never cuts off a player who is already connected.
- The page asks to keep the screen on.
- Joining keeps looking for the room for about 30 s instead of failing on the first miss.
- A **RUN NETWORK CHECK** button (or add `?check` to the link) tests the service, a full connection on the device, and whether the router allows direct links between homes.
- A **WHAT HAPPENED** log at the bottom. Screenshot it if anything fails.

**Before the next try:** on each device, run the network check first and screenshot it. Keep the host screen on and in front while your brother joins (send him the code from a different device, or read it out on a call).

## Part 1: your brother checks his PS4 (2 minutes, any time)
1. On the PS4, open the **Internet Browser** and go to the test page above.
2. Look at the box **"This browser can…"** and send a photo of it.
   - Four ✔ lines: the PS4 might work as his device. Do Part 2 on the PS4.
   - Any ✘ (most likely): use a laptop, PC or Android phone instead. See Part 2.

## Part 2: the real test (both of you)
**Your brother, on a laptop or PC (Chrome or Edge):**
1. Plug the PS4 controller in with a USB cable, or pair it with Bluetooth (hold **PS + Share** until the light flashes, then pick "Wireless Controller" in the computer's Bluetooth settings).
2. Open the test page and wait.

**You, on the Xbox:**
1. Open Edge and go to the test page.
2. Press **A** on your controller (or select **HOST A ROOM**).
3. Read the 4-letter **room code** on the TV to your brother.

**Your brother:**
1. Types the code and presses **JOIN**.
2. Presses a few buttons and moves the left stick on the PS4 controller.
3. He should see the moving test picture from your TV. A **"P4" dot** moves when he moves his stick and grows when he presses X on the PS4 controller (that's "A" on an Xbox pad).

**What PASS looks like:**
- On the TV: **PASS** in green, with ✔ on every line. "Their controller arrives here" shows about 30 per second, and the delay is under 250 ms.
- On his screen: **PASS** in green. The video plays smoothly (around 30 fps).

## Send back
- A photo of the TV result and a screenshot of his result. The delay number matters most.
- What device he used (PS4, laptop, phone) and roughly how far apart you live.
- How the P4 dot felt: instant, slightly late, or laggy.

## If something fails
| What you see | What it means |
| --- | --- |
| TV: ✘ "This browser can send video" | The Xbox can't stream. Fallback: host from a laptop plugged into the TV. |
| TV or his side: ✘ "Could not reach the connection service" | The free connection service is down or blocked. Try again later or on another network. |
| His side: ✘ "No room called …" | Wrong code, or the TV page was closed. Re-check the code. |
| "Strict router (symmetric NAT)" in the network check | Direct links between homes will likely fail. We'll add a relay server (needs a free account). |
| Connected but video never plays | Your home networks block direct connections. We'll add a relay server (needs a free account). |
| Delay over 250 ms | Playable for slower games, rough for Ricochet Rooftop. We'll lower the video quality. |

## Privacy
The free public PeerJS service only introduces the two browsers to each other. The video and controller data go directly between your Xbox and his device. The test page stores nothing.
