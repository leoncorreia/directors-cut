import { jsPDF } from "jspdf";
import type { Revision } from "../types";

const margin = 20;
const pageWidth = 210;
const contentWidth = pageWidth - margin * 2;

const writeWrapped = (
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight = 5,
): number => {
  const lines = doc.splitTextToSize(text || "-", maxWidth);
  doc.text(lines, x, y);
  return y + lines.length * lineHeight;
};

export const exportDirectorsNotesPDF = (brief: string, styleDNA: string, revisions: Revision[]): void => {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("CineAgent — Director's Notes", margin, 25);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(120, 120, 120);
  doc.setFontSize(10);
  doc.text(`Generated ${new Date().toLocaleString()}`, margin, 32);
  doc.setTextColor(0, 0, 0);

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Brief", margin, 42);
  doc.setFont("helvetica", "normal");
  let y = writeWrapped(doc, brief, margin, 48, contentWidth);

  if (styleDNA.trim()) {
    doc.setFont("helvetica", "bold");
    doc.text("Style DNA", margin, y + 4);
    doc.setFont("helvetica", "normal");
    y = writeWrapped(doc, styleDNA, margin, y + 10, contentWidth);
  }

  doc.setDrawColor(210, 210, 220);
  doc.line(margin, y + 4, margin + contentWidth, y + 4);

  revisions.forEach((revision) => {
    doc.addPage();
    let cursorY = 24;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(124, 106, 247);
    doc.text(`Take ${revision.takeNumber}`, margin, cursorY);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(110, 110, 130);
    doc.setFontSize(9);
    doc.text(revision.createdAt.toLocaleString(), margin, cursorY + 5);

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("Director's Notes", margin, cursorY + 12);
    doc.setFont("helvetica", "normal");
    cursorY = writeWrapped(doc, revision.agentResponse.directorNotes, margin, cursorY + 17, contentWidth);

    const rows: Array<[string, string]> = [
      ["Scene", revision.agentResponse.shotPlan.scene],
      ["Mood", revision.agentResponse.shotPlan.mood],
      ["Color Palette", revision.agentResponse.shotPlan.colorPalette.join(", ")],
      ["Camera Motion", revision.agentResponse.shotPlan.cameraMotion],
      ["Lighting", revision.agentResponse.shotPlan.lighting],
      ["Pacing", revision.agentResponse.shotPlan.pacing],
      ["Subjects", revision.agentResponse.shotPlan.subjects],
      ["Background", revision.agentResponse.shotPlan.background],
      ["Style", revision.agentResponse.shotPlan.style],
    ];

    cursorY += 4;
    rows.forEach((row, rowIndex) => {
      if (cursorY > 270) {
        doc.addPage();
        cursorY = 20;
      }
      if (rowIndex % 2 === 0) {
        doc.setFillColor(245, 245, 250);
        doc.rect(margin, cursorY - 4, contentWidth, 8, "F");
      }
      doc.setFont("helvetica", "bold");
      doc.text(row[0], margin + 2, cursorY + 1);
      doc.setFont("helvetica", "normal");
      const split = doc.splitTextToSize(row[1] || "-", contentWidth - 55);
      doc.text(split, margin + 40, cursorY + 1);
      cursorY += Math.max(8, split.length * 4 + 1);
    });

    cursorY += 2;
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    cursorY = writeWrapped(doc, `Seedance Prompt: ${revision.seedancePrompt}`, margin + 3, cursorY + 2, contentWidth - 6, 4);

    doc.setFont("helvetica", "italic");
    doc.setTextColor(245, 158, 11);
    cursorY = writeWrapped(doc, `Critique: ${revision.agentResponse.critique}`, margin, cursorY + 4, contentWidth, 4);

    doc.setTextColor(90, 90, 90);
    doc.setFont("helvetica", "normal");
    writeWrapped(
      doc,
      `Video: ${revision.videoUrl ?? "Still rendering"}`,
      margin,
      cursorY + 6,
      contentWidth,
      4,
    );
  });

  doc.save("cineagent-directors-notes.pdf");
};
