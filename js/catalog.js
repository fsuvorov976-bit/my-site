document.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('catalog-list');

  try {
    const response = await fetch('/api/catalog');
    const items = await response.json();

    if (items.length === 0) {
      container.innerHTML = '<p>Каталог пуст</p>';
      return;
    }

    container.innerHTML = items.map(item => `
      <div class="card">
        <h3>${item.name}</h3>
        <p>Категория: ${item.category || 'Без категории'}</p>
        <strong>${item.price} ₽</strong>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = '<p style="color: red;">Ошибка загрузки товаров от сервера</p>';
  }
});