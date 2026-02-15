export default function CamposDinamicos({ tipo, form, setForm }) {
  switch (Number(tipo)) {
    case 1:
      return <div>/* Campos especiales Control de Calidad (futuro) */</div>;

    case 2:
      return <div>/* Campos especiales Mantenimiento (futuro) */</div>;

    case 3:
      return <div>/* Campos especiales Microbiología (futuro) */</div>;

    case 6:
      return <div>/* Campos especiales Compras (futuro) */</div>;

    default:
      return null;
  }
}
