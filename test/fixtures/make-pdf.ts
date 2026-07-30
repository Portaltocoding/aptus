/**
 * Generador de PDF de prueba. Los tests de ingesta necesitan PDF de VERDAD (que
 * pdf.js sepa abrir), no ficheros con cabecera falsa; y no pueden depender de un
 * binario externo ni de un fixture opaco que nadie sepa regenerar.
 *
 * Se escribe el PDF a mano, sin comprimir y con la tabla xref bien calculada: son
 * cinco objetos y cabe entero aquí.
 */

/** Escapa lo que un literal de cadena PDF no admite en crudo. */
function escapePdf(s: string): string {
  return s.replace(/([()\\])/g, "\\$1");
}

function assemble(objs: string[]): Buffer {
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, "latin1");
  out +=
    `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` +
    offsets.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("");
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

/** Un PDF de una página con las líneas dadas como texto extraíble. */
export function makeTextPdf(lines: string[]): Buffer {
  const content =
    "BT /F1 12 Tf 50 750 Td 16 TL\n" +
    lines.map((l) => `(${escapePdf(l)}) Tj T*`).join("\n") +
    "\nET\n";

  return assemble([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R " +
      "/Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}endstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ]);
}

/**
 * Un PDF válido cuya página no tiene ni una letra: el equivalente sintético de un
 * escaneo (páginas que son imagen). Se abre bien, pero no hay texto que sacar.
 */
export function makeScannedPdf(): Buffer {
  const content = "0.5 0.5 0.5 rg 50 600 200 100 re f\n";
  return assemble([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << >> >>",
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}endstream`,
  ]);
}

/** Bytes que dicen ser un PDF y no lo son. Un fichero corrupto de manual. */
export function makeCorruptPdf(): Buffer {
  return Buffer.from("%PDF-1.4\nesto no es la estructura de un PDF\n%%EOF\n", "latin1");
}
