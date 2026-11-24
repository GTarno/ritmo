// Tela provisória usada enquanto cada área não é implementada.
export function placeholder(title, issue) {
  const section = document.createElement('section');
  const h2 = document.createElement('h2');
  h2.textContent = title;
  const p = document.createElement('p');
  p.textContent = `Em construção (issue ${issue}).`;
  section.append(h2, p);
  return section;
}
