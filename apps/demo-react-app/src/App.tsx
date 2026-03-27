import { useEffect, useMemo, useState } from "react";
import { createBridgeClient, VscodeTransport, WindowTransport } from "@agently/bridge";

type Card = {
  id: string;
  title: string;
  description: string;
  accent: string;
  item: string;
  meta: string;
};

const cards: Card[] = [
  {
    id: "memberships",
    title: "Memberships",
    description: "Manage plans and pricing across active students.",
    accent: "#4caf50",
    item: "Monthly Youth",
    meta: "$200 / month"
  },
  {
    id: "manager",
    title: "Manager",
    description: "Track coaches and assign classes in seconds.",
    accent: "#7c4dff",
    item: "Coach Coverage",
    meta: "4 active coaches"
  },
  {
    id: "trial-sessions",
    title: "Trial Sessions",
    description: "Capture trial demand and convert users faster.",
    accent: "#00bcd4",
    item: "Kids Basic Karate",
    meta: "28 members"
  },
  {
    id: "schedule",
    title: "Schedule",
    description: "Plan classes and avoid overlapping sessions.",
    accent: "#66bb6a",
    item: "Little Tiger",
    meta: "10:00 - 10:30"
  },
  {
    id: "billing",
    title: "Billing",
    description: "Review payment status and subscription trends.",
    accent: "#ff9800",
    item: "Youth Membership",
    meta: "$99 pending"
  },
  {
    id: "branding",
    title: "Custom Branding",
    description: "Control logos, color and design variants.",
    accent: "#673ab7",
    item: "Primary Colour",
    meta: "#4006BC"
  }
];

export default function App() {
  const [status, setStatus] = useState("Ready");

  const client = useMemo(
    () =>
      createBridgeClient([
        new VscodeTransport(),
        new WindowTransport()
      ]),
    []
  );

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (!e.shiftKey || e.button !== 0) return;

      const cardElement = (e.target as HTMLElement).closest("[data-card]");
      if (!cardElement) return;

      e.preventDefault();

      const cardId = cardElement.getAttribute("data-card");
      const card = cards.find((c) => c.id === cardId);
      if (card) {
        sendPrompt(card);
      }
    };

    window.addEventListener("mousedown", handleMouseDown, true);
    return () => window.removeEventListener("mousedown", handleMouseDown, true);
  }, [client]);

  const sendPrompt = (card: Card) => {
    const text = `Improve the ${card.title} section with better hierarchy.`;

    client.notify("prompt.send", {
      text,
      source: "demo-react-app",
      context: {
        selector: `[data-card='${card.id}']`,
        pageUrl: window.location.href,
        cardTitle: card.title
      }
    });

    setStatus(`Sent prompt for ${card.title}`);
  };

  return (
    <main className="page">
      <header className="header">
        <h1>Agently Demo Dashboard</h1>
        <p>Shift + left-click any card in your local app, or use quick prompts below.</p>
        <div className="status">Bridge status: {status}</div>
      </header>

      <section className="grid">
        {cards.map((card) => (
          <article key={card.id} data-card={card.id} className="card">
            <div className="icon" style={{ borderColor: card.accent }} />
            <h2>{card.title}</h2>
            <p>{card.description}</p>
            <button className="item" onClick={() => sendPrompt(card)}>
              <span className="bar" style={{ backgroundColor: card.accent }} />
              <span>
                <strong>{card.item}</strong>
                <small>{card.meta}</small>
              </span>
              <span aria-hidden>→</span>
            </button>
          </article>
        ))}
      </section>
    </main>
  );
}
