/* 이름순 버튼: handleSort → refreshList → algorithms.mergeSort → renderRestaurants */
(function () {
  'use strict';
  const algorithms = window.RestaurantAlgorithms;
  const $ = (selector) => document.querySelector(selector);
  const storageKey = 'youngha-food-journal-notes-v1';

  // 알려주지 않은 방문 날짜, 평점, 개인 후기는 만들어 넣지 않습니다.
  const restaurants = [
    { id: 'nongmin', name: '농민백암순대', area: '대치동', category: '국밥', image: 'assets/nongminbagamsundae.webp', source: 'https://www.diningcode.com/profile.php?rid=yJWYroWneBZz', sourceName: '다이닝코드' },
    { id: 'geodae', name: '거대곰탕 서초점', area: '서초', category: '곰탕', image: 'assets/geodaegomtang.jpg', source: 'https://www.konest.com/contents/gourmet_mise_detail.html?id=40697', sourceName: '코네스트' },
    { id: 'sushi', name: '스시이안앤 DMC역점', area: 'DMC역', category: '초밥', image: 'assets/sushiianand.jpg', source: 'https://www.tabling.co.kr/restaurant/12683', sourceName: '테이블링' },
    { id: 'uraeok', name: '우래옥', area: '서울 중구', category: '평양냉면', image: 'assets/uraeok.jpg', source: 'https://www.tasteatlas.com/woo-lae-oak', sourceName: 'TasteAtlas' }
  ];

  let direction = null;
  let notes = readNotes();
  let editingId = null;
  let toastTimer = null;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function readNotes() {
    const result = Object.create(null);
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || '{}');
      if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
        for (const restaurant of restaurants) {
          const note = stored[restaurant.id];
          if (note && typeof note === 'object') {
            result[restaurant.id] = {
              date: typeof note.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(note.date) ? note.date : '',
              review: typeof note.review === 'string' ? note.review.slice(0, 1000) : ''
            };
          }
        }
      }
    } catch (_) { /* 저장소를 사용할 수 없어도 사이트와 정렬은 동작합니다. */ }
    return result;
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    $('#toast').textContent = message;
    $('#toast').hidden = false;
    toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 3500);
  }

  function imageFallback(image) {
    image.addEventListener('error', () => {
      const message = element('div', 'image-missing', '사진을 불러올 수 없어요. assets 폴더의 파일 이름을 확인해 주세요.');
      image.replaceWith(message);
    }, { once: true });
  }

  function renderRestaurants(items) {
    const fragment = document.createDocumentFragment();
    items.forEach((restaurant, index) => {
      const card = element('article', 'restaurant-card');
      card.dataset.id = restaurant.id;
      card.style.animationDelay = (index * 35) + 'ms';
      const media = element('div', 'card-media');
      const photo = document.createElement('img');
      photo.alt = restaurant.name + '의 간판과 외관';
      photo.loading = 'lazy';
      imageFallback(photo);
      photo.src = restaurant.image;
      media.append(photo);

      const body = element('div', 'card-body');
      const category = element('p', 'category-line');
      category.append(element('span', 'category-tag', restaurant.category), element('span', '', restaurant.area));
      const note = notes[restaurant.id] || {};
      body.append(category, element('h3', '', restaurant.name));
      body.append(element('p', 'record-preview', note.review || '아직 남긴 후기가 없어요.'));
      body.append(element('p', 'visit-date', note.date ? '방문일 · ' + note.date : '방문 날짜 미기록'));
      const bottom = element('div', 'card-bottom');
      const edit = element('button', 'record-button', note.date || note.review ? '기록 수정' : '기록 남기기');
      edit.type = 'button';
      edit.setAttribute('aria-label', restaurant.name + ' ' + edit.textContent);
      edit.addEventListener('click', () => openRecord(restaurant));
      const source = element('a', 'source-link', '사진 출처');
      source.href = restaurant.source;
      source.target = '_blank';
      source.rel = 'noopener noreferrer';
      source.setAttribute('aria-label', restaurant.name + ' 사진 출처: ' + restaurant.sourceName + ' (새 창)');
      bottom.append(edit, source);
      body.append(bottom);
      card.append(media, body);
      fragment.append(card);
    });
    $('#restaurant-grid').replaceChildren(fragment);
    $('#empty-state').hidden = items.length !== 0;
    $('#list-count').textContent = items.length === restaurants.length
      ? restaurants.length + '곳의 기록'
      : restaurants.length + '곳 중 ' + items.length + '곳';
  }

  // 이름순 버튼이 호출하는 실제 처리 함수입니다.
  function handleSort(nextDirection) {
    direction = nextDirection;
    refreshList();
  }

  function refreshList() {
    const query = $('#restaurant-search').value.trim().toLocaleLowerCase('ko');
    const filteredRestaurants = restaurants.filter((restaurant) =>
      (restaurant.name + ' ' + restaurant.area + ' ' + restaurant.category).toLocaleLowerCase('ko').includes(query)
    );
    const comparator = algorithms.createComparator({ key: 'name', direction: direction || 'asc' });
    let ordered = filteredRestaurants.slice();
    if (direction) {
      // 이름순 버튼에서 실제 병합 정렬을 실행한 뒤 화면을 갱신합니다.
      ordered = algorithms.mergeSort(filteredRestaurants, comparator);
      $('#sort-feedback').textContent = (direction === 'asc' ? '가나다순' : '이름 역순') + '으로 정렬했어요.';
    } else {
      $('#sort-feedback').textContent = '기록 순서로 보고 있어요. 원하는 순서로 맛집을 둘러보세요.';
    }
    document.querySelectorAll('[data-sort]').forEach((button) =>
      button.setAttribute('aria-pressed', String(button.dataset.sort === direction))
    );
    $('#reset-order').setAttribute('aria-pressed', String(direction === null));
    renderRestaurants(ordered);
  }

  function openRecord(restaurant) {
    editingId = restaurant.id;
    const note = notes[editingId] || {};
    $('#record-title').textContent = restaurant.name;
    $('#visit-date').value = note.date || '';
    $('#visit-review').value = note.review || '';
    $('#record-dialog').showModal();
  }

  $('#record-form').addEventListener('submit', (event) => {
    event.preventDefault();
    if (!editingId || !$('#record-form').reportValidity()) return;
    notes[editingId] = { date: $('#visit-date').value, review: $('#visit-review').value.trim() };
    let saved = true;
    try { localStorage.setItem(storageKey, JSON.stringify(notes)); } catch (_) { saved = false; }
    $('#record-dialog').close();
    refreshList();
    showToast(saved ? '이 브라우저에 기록을 저장했어요.' : '지금 화면에는 반영했지만 브라우저 저장소에 저장하지 못했어요.');
  });
  $('#close-dialog').addEventListener('click', () => $('#record-dialog').close());

  document.querySelectorAll('[data-sort]').forEach((button) =>
    button.addEventListener('click', () => handleSort(button.dataset.sort))
  );
  $('#reset-order').addEventListener('click', () => handleSort(null));
  $('#restaurant-search').addEventListener('input', refreshList);
  refreshList();
})();

