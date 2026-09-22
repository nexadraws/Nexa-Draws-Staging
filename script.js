'use strict';

/* =========================================================
   NEXA DRAW — CLEAN FRONT-END
   ========================================================= */

const SUPABASE_URL =
  'https://hkxegnjlxuscusygckqm.supabase.co';

const SUPABASE_KEY =
  'sb_publishable_kO22Zj703int4nZp8ha9jg_hwgz5f9X';

const ADMIN_UID =
  '2b4b64c6-b96f-4b85-bce3-be28c141311e';

const PAYMENT_MODE = 'live';
const PAYMENT_PROVIDER = 'Nochex';

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

const $ = (selector, root = document) =>
  root.querySelector(selector);

const $$ = (selector, root = document) =>
  [...root.querySelectorAll(selector)];

const store = {
  get(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
      return fallback;
    }
  },

  set(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }
};

if (!localStorage.getItem('nexa_cart')) {
  store.set('nexa_cart', []);
}

let competitions = [];
let cart = store.get('nexa_cart', []);
let user = null;
let checkoutPending = false;

/*
  Used when somebody tries to enter
  a free competition before logging in.
*/
let freeEntryPending = null;


/* =========================================================
   HELPERS
   ========================================================= */

function money(value) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP'
  }).format(Number(value) || 0);
}

function isFreeCompetition(competition) {
  return Number(competition?.price || 0) === 0;
}

function competitionPriceLabel(competition) {
  return isFreeCompetition(competition)
    ? 'FREE ENTRY'
    : `${money(competition.price)} per entry`;
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  })[character]);
}

function daysLeft(date) {
  if (!date) return 'CLOSING DATE TBC';

  const difference = Math.ceil(
    (new Date(date) - new Date()) / 86400000
  );

  if (difference > 0) {
    return `ENDS IN ${difference} DAY${difference === 1 ? '' : 'S'}`;
  }

  return 'CLOSED';
}

function formatDate(date) {
  if (!date) return '';

  const parsed = new Date(date);

  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  return parsed.toLocaleDateString('en-GB');
}

function toast(message) {
  const element = $('#toast');

  if (!element) return;

  element.textContent = message;
  element.classList.add('show');

  setTimeout(() => {
    element.classList.remove('show');
  }, 2200);
}

function openModal(id) {
  const modal = $(id);

  if (!modal) return;

  modal.classList.add('show');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
}

function closeModals() {
  $$('.modal').forEach(modal => {
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
  });

  document.body.classList.remove('modal-open');
}

async function isAdminSession() {
  const {
    data: { session }
  } = await supabaseClient.auth.getSession();

  return session?.user?.id === ADMIN_UID;
}

async function functionErrorMessage(error, fallback) {
  try {
    const response = error?.context;

    if (response && typeof response.clone === 'function') {
      const body = await response.clone().json();

      if (body?.error) return body.error;
      if (body?.message) return body.message;
    }
  } catch {
    // Use fallback.
  }

  return fallback;
}


/* =========================================================
   COMPETITIONS
   ========================================================= */

async function loadCompetitionsFromSupabase() {
  const { data, error } = await supabaseClient
    .from('competitions')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Supabase competitions error:', error);
    toast('Could not load competitions');
    return;
  }

  competitions = (data || []).map(row => ({
    id: String(row.id),
    title: row.title || '',
    price: Number(row.price || 0),
    image: row.image_url || '',
    closes: row.closes_at || '',
    max: Number(row.max_entries || 0),
    sold: Number(row.sold || 0),
    status: row.status || 'live',
    description: row.description || '',
    skill_question: row.skill_question || '',
    skill_option_a: row.skill_option_a || '',
    skill_option_b: row.skill_option_b || '',
    skill_option_c: row.skill_option_c || ''
  }));

  renderDraws();
renderFeaturedDraw();
}

function renderFeaturedDraw() {
  const host = $('#featuredDrawContent');

  if (!host) return;

  const competition = competitions.find(
    item => item.status === 'live'
  );

  if (!competition) {
    host.innerHTML = '';
    return;
  }

  const percentage = competition.max > 0
    ? Math.min(
        100,
        Math.round(
          (competition.sold / competition.max) * 100
        )
      )
    : 0;

  const free = isFreeCompetition(competition);

  host.innerHTML = `
    <div class="featured-draw-card">

      <div class="featured-draw-image">
        <img
          src="${escapeHtml(competition.image)}"
          alt="${escapeHtml(competition.title)}"
        >
      </div>

      <div class="featured-draw-info">

        <p class="eyebrow">
          ${free ? '🔥 CURRENT FREE DRAW' : '🔥 CURRENT DRAW'}
        </p>

        <h2>
          ${escapeHtml(competition.title)}
        </h2>

        <div class="detail-price">
          ${free ? 'FREE ENTRY' : money(competition.price)}
        </div>

        <p>
          ${daysLeft(competition.closes)}
        </p>

        <div class="bar">
          <i style="width:${percentage}%"></i>
        </div>

        <div class="stats">
          <b>${percentage}% entered</b>

          <span>
            ${competition.sold.toLocaleString()}
            /
            ${competition.max.toLocaleString()}
          </span>
        </div>

        <button
          class="btn gold full"
          id="featuredEnterBtn"
          type="button"
        >
          ${free ? 'ENTER FREE DRAW' : 'ENTER NOW'}
        </button>

      </div>

    </div>
  `;

  $('#featuredEnterBtn')?.addEventListener(
    'click',
    () => showCompetition(competition.id)
  );
}

function renderDraws() {
  const host = $('#drawCards');

  if (!host) return;

  const live = competitions.filter(
    competition => competition.status === 'live'
  );

  if (!live.length) {
    host.innerHTML = `
      <p class="empty">No live competitions right now.</p>
    `;
    return;
  }

  host.innerHTML = live.map(competition => {
    const percentage = competition.max > 0
      ? Math.min(
          100,
          Math.round(
            (competition.sold / competition.max) * 100
          )
        )
      : 0;

    const free = isFreeCompetition(competition);

    return `
      <article
        class="card"
        data-id="${escapeHtml(competition.id)}"
      >
        <div class="card-img">
          <img
            src="${escapeHtml(competition.image)}"
            alt="${escapeHtml(competition.title)}"
          >

          <span>${daysLeft(competition.closes)}</span>
        </div>

        <div class="card-body">
          ${
            free
              ? `
                <p class="eyebrow">
                  FREE DRAW
                </p>
              `
              : ''
          }

          <h3>${escapeHtml(competition.title)}</h3>

          <p>
            ${
              free
                ? '<strong>FREE ENTRY</strong>'
                : `${money(competition.price)} per entry`
            }
          </p>

          <div class="bar">
            <i style="width:${percentage}%"></i>
          </div>

          <div class="stats">
            <b>${percentage}% entered</b>

            <span>
              ${competition.sold.toLocaleString()}
              /
              ${competition.max.toLocaleString()}
            </span>
          </div>

          <button
            class="enter"
            data-open-comp="${escapeHtml(competition.id)}"
          >
            ${
              free
                ? 'ENTER FREE DRAW'
                : 'ENTER NOW'
            }
          </button>
        </div>
      </article>
    `;
  }).join('');

  $$('[data-open-comp]').forEach(button => {
    button.onclick = () => {
      showCompetition(button.dataset.openComp);
    };
  });
}

function showCompetition(id) {
  const competition = competitions.find(
    item => item.id === String(id)
  );

  if (!competition) return;

  if (competition.status !== 'live') {
    toast('This competition is no longer available.');
    renderDraws();
    return;
  }

  const free = isFreeCompetition(competition);

  const remaining = Math.max(
    0,
    competition.max - competition.sold
  );

  const maximumChoice = Math.max(
    1,
    Math.min(100, remaining)
  );

  const content = $('#competitionContent');

  if (!content) return;

  content.innerHTML = `
    <div class="competition-detail">
      <img
        src="${escapeHtml(competition.image)}"
        alt="${escapeHtml(competition.title)}"
      >

      <div>
        <p class="eyebrow">
          ${
            free
              ? 'FREE DRAW'
              : 'LIVE COMPETITION'
          }
        </p>

        <h2>${escapeHtml(competition.title)}</h2>

        <p>
          ${escapeHtml(competition.description)}
        </p>

        <div class="detail-price">
          ${
            free
              ? 'FREE'
              : money(competition.price)
          }

          <small>
            ${
              free
                ? 'one free entry'
                : 'per entry'
            }
          </small>
        </div>

        <p>
          <strong>
            ${remaining.toLocaleString()}
          </strong>
          entries remaining
        </p>

        ${
          remaining > 0
            ? free
              ? `
                <p class="micro">
                  One free entry will be issued to your
                  Nexa account after you answer the
                  skill question correctly.
                </p>

                <button
                  class="btn gold full"
                  id="addToCart"
                >
                  ENTER FREE DRAW
                </button>
              `
              : `
  <div class="free-entry-notice">
    <strong>FREE ENTRY ROUTE AVAILABLE</strong>

    <p>
      You can also enter this competition by post using our
      free entry route.
    </p>

    <button
      type="button"
      class="link-btn"
      data-legal="free"
    >
      VIEW FREE ENTRY ROUTE
    </button>
  </div>

  <div class="ticket-selector">

  <div class="ticket-selector-head">
    <span>Number of tickets</span>

    <strong id="ticketQtyDisplay">
      ${Math.min(5, maximumChoice)}
    </strong>
  </div>

  <input
    id="entryQty"
    class="ticket-slider"
    type="range"
    min="1"
    max="${maximumChoice}"
    value="${Math.min(5, maximumChoice)}"
    step="1"
  >

  <div class="ticket-slider-labels">
    <span>1</span>
    <span>${maximumChoice}</span>
  </div>

  <div class="ticket-quick-options">
    ${[5, 10, 15, 20]
      .filter(qty => qty <= maximumChoice)
      .map(qty => `
        <button
          type="button"
          class="ticket-quick-btn"
          data-ticket-qty="${qty}"
        >
          ${qty}
        </button>
      `)
      .join('')}
  </div>

</div>

<button
  class="btn gold full"
  id="addToCart"
>
  ADD ${Math.min(5, maximumChoice)} TICKETS —
  ${money(
    competition.price *
    Math.min(5, maximumChoice)
  )}
</button>

               
                              `
            : `
              <p>
                This competition has no entries remaining.
              </p>
            `
        }


        ${
          free
       
            ? `
              <p class="micro">
                No payment is required for this draw.
              </p>
            `
            : `
              <p class="micro">
                Secure payment processing is still
                in preparation.
              </p>
            `
        }
      </div>
    </div>
  `;

const ticketSlider =
  $('#entryQty');

const ticketDisplay =
  $('#ticketQtyDisplay');

const addButton =
  $('#addToCart');

function updateTicketSelector(quantity) {
  if (!ticketSlider || !addButton) return;

  const qty = Math.max(
    1,
    Math.min(
      Number(quantity) || 1,
      maximumChoice
    )
  );

  ticketSlider.value = qty;

  if (ticketDisplay) {
    ticketDisplay.textContent = qty;
  }

  addButton.textContent =
    `ADD ${qty} TICKET${qty === 1 ? '' : 'S'} — ` +
    money(competition.price * qty);

  $$('.ticket-quick-btn').forEach(button => {
    button.classList.toggle(
      'active',
      Number(button.dataset.ticketQty) === qty
    );
  });
}

ticketSlider?.addEventListener(
  'input',
  () => {
    updateTicketSelector(
      ticketSlider.value
    );
  }
);

$$('.ticket-quick-btn').forEach(button => {
  button.addEventListener(
    'click',
    () => {
      updateTicketSelector(
        button.dataset.ticketQty
      );
    }
  );
});

updateTicketSelector(
  Math.min(5, maximumChoice)
);
   
  $('#addToCart')?.addEventListener(
    'click',
    () => {
      openSkillQuestion(competition.id);
    }
  );

  openModal('#competitionModal');
}


/* =========================================================
   SKILL QUESTION
   ========================================================= */

function openSkillQuestion(id) {
  const competition = competitions.find(
    item => item.id === String(id)
  );

  if (!competition) return;

  if (competition.status !== 'live') {
    toast('This competition is no longer available.');
    return;
  }

  const free = isFreeCompetition(competition);

  const remaining = Math.max(
    0,
    competition.max - competition.sold
  );

  const quantity = free
    ? 1
    : Math.max(
        1,
        Math.min(
          100,
          remaining,
          Number($('#entryQty')?.value) || 1
        )
      );

  const question = $('#skillQuestion');
  const answers = $('#skillAnswers');
  const errorHost = $('#skillError');

  if (!question || !answers || !errorHost) {
    return;
  }

  question.textContent =
    competition.skill_question ||
    'Skill question unavailable.';

  errorHost.textContent = '';
  answers.innerHTML = '';

  [
    competition.skill_option_a,
    competition.skill_option_b,
    competition.skill_option_c
  ]
    .filter(Boolean)
    .forEach(option => {
      const button = document.createElement('button');

      button.className = 'btn outline full';
      button.type = 'button';
      button.dataset.skill = option;
      button.textContent = option;

      answers.appendChild(button);
    });

  $$('[data-skill]').forEach(button => {
    button.onclick = async () => {
      errorHost.textContent = 'Checking answer...';

      $$('[data-skill]').forEach(item => {
        item.disabled = true;
      });

      const { data, error } =
        await supabaseClient.functions.invoke(
          'check-skill-answer',
          {
            body: {
              competition_id: competition.id,
              answer: button.dataset.skill
            }
          }
        );

      $$('[data-skill]').forEach(item => {
        item.disabled = false;
      });

      if (error) {
        console.error(
          'Skill answer check failed:',
          error
        );

        errorHost.textContent =
          'Unable to check your answer. Please try again.';

        return;
      }

      if (!data?.correct) {
        errorHost.textContent =
          'Incorrect answer. Please try again.';

        return;
      }

      /*
        FREE DRAW:
        DO NOT ADD TO BASKET.
        CREATE SECURE FREE ENTRY.
      */
      if (free) {
        closeModals();

        await enterFreeCompetition(
          competition.id
        );

        return;
      }

      /*
        NORMAL PAID COMPETITION.
      */
      addToCart(
        competition.id,
        quantity
      );

      closeModals();
      openCart();
    };
  });

  closeModals();
  openModal('#skillModal');
}


/* =========================================================
   FREE COMPETITION ENTRY
   ========================================================= */

async function enterFreeCompetition(id) {
  const competition = competitions.find(
    item => item.id === String(id)
  );

  if (!competition) {
    alert('Competition could not be found.');
    return;
  }

  if (competition.status !== 'live') {
    toast('This competition is no longer available.');
    return;
  }

  if (!isFreeCompetition(competition)) {
    alert(
      'This is not a free competition.'
    );
    return;
  }

  const remaining = Math.max(
    0,
    competition.max - competition.sold
  );

  if (remaining <= 0) {
    toast('This free draw is full.');
    return;
  }

  const customer =
    await getCurrentCustomer();

  /*
    USER MUST HAVE AN ACCOUNT.
  */
  if (!customer) {
    freeEntryPending = competition.id;

    closeModals();

    await renderAccount(true);

    openModal('#accountModal');

    toast(
      'Log in or create an account to receive your free ticket'
    );

    return;
  }

  /*
    SECURE SERVER-SIDE FREE ENTRY.

    The Supabase Edge Function should:
    - verify the logged-in user
    - verify competition is live
    - verify price = 0
    - prevent duplicate free entry if desired
    - create the order/entry
    - create the ticket number
    - increase sold count
    - return the ticket number
  */
  const { data, error } =
    await supabaseClient.functions.invoke(
      'create-free-entry-v2',
      {
        body: {
          competition_id: competition.id
        }
      }
    );

  if (error) {
    console.error(
      'Free entry error:',
      error
    );

    alert(
      await functionErrorMessage(
        error,
        'Your free entry could not be created.'
      )
    );

    return;
  }

  if (!data?.success) {
    alert(
      data?.error ||
      data?.message ||
      'Your free entry could not be created.'
    );

       return;
  }

  freeEntryPending = null;

  await loadCompetitionsFromSupabase();

  const ticketNumber =
    data?.ticket?.ticket_number ||
    data?.ticket_number ||
    '';

  if (ticketNumber) {
    alert(
      `You're entered!\n\n` +
      `Competition: ${competition.title}\n` +
      `Ticket number: ${ticketNumber}\n\n` +
      `Your ticket is saved in My Account.`
    );
  } else {
    alert(
      `You're entered into "${competition.title}".\n\n` +
      'Your entry has been saved to your Nexa account.'
    );
  }

  toast('Free entry confirmed');

  /*
    OPEN CUSTOMER ACCOUNT SO THEY CAN
    SEE THEIR TICKET.
  */
  await renderAccount(false);
  openModal('#accountModal');
}


/* =========================================================
   BASKET
   ========================================================= */

function addToCart(id, quantity) {
  cart = store.get('nexa_cart', []);

  const competition = competitions.find(
    item => item.id === String(id)
  );

  if (!competition) return;

  if (competition.status !== 'live') {
    toast('This competition is no longer available.');
    return;
  }

  /*
    FREE COMPETITIONS NEVER GO INTO CART.
  */
  if (isFreeCompetition(competition)) {
    enterFreeCompetition(competition.id);
    return;
  }

  const remaining = Math.max(
    0,
    competition.max - competition.sold
  );

  if (remaining <= 0) {
    toast(
      'No entries remaining for this competition.'
    );
    return;
  }

  quantity = Math.max(
    1,
    Math.min(
      Number(quantity) || 1,
      100,
      remaining
    )
  );

  const found = cart.find(
    item => item.id === String(id)
  );

  if (found) {
    found.qty = Math.min(
      Number(found.qty || 0) + quantity,
      100,
      remaining
    );
  } else {
    cart.push({
      id: String(id),
      qty: quantity
    });
  }

  store.set('nexa_cart', cart);
  updateCartCount();

  toast('Entries added to your basket');
}

function updateCartCount() {
  cart = store.get('nexa_cart', []);

  const count = cart.reduce(
    (total, item) =>
      total + Number(item.qty || 0),
    0
  );

  const countHost = $('#cartCount');

  if (countHost) {
    countHost.textContent = count;
  }
}

async function openCart() {
  /*
    ONLY PAID, LIVE COMPETITIONS
    BELONG IN THE BASKET.
  */
  cart = store.get('nexa_cart', []).filter(
    item =>
      competitions.some(
        competition =>
          competition.id === String(item.id) &&
          competition.status === 'live' &&
          !isFreeCompetition(competition)
      )
  );

  store.set('nexa_cart', cart);

  updateCartCount();

  let total = 0;

  const host = $('#cartItems');

  if (!host) return;

  host.innerHTML = cart.length
    ? cart.map((item, index) => {
        const competition = competitions.find(
          competition =>
            competition.id === String(item.id) &&
            competition.status === 'live' &&
            !isFreeCompetition(competition)
        );

        if (!competition) return '';

        const lineTotal =
          competition.price *
          Number(item.qty || 0);

        total += lineTotal;

        return `
          <div class="cart-line">
            <div>
              <strong>
                ${escapeHtml(competition.title)}
              </strong>

              <small>
                ${item.qty} ×
                ${money(competition.price)}
              </small>
            </div>

            <div>
              <b>${money(lineTotal)}</b>

              <button
                class="remove"
                data-remove="${index}"
              >
                Remove
              </button>
            </div>
          </div>
        `;
      }).join('')
    : `
        <p class="empty">
          Your basket is empty.
        </p>
      `;

  const totalHost = $('#cartTotal');

  if (totalHost) {
    totalHost.textContent = money(total);
  }

  $$('[data-remove]').forEach(button => {
    button.onclick = () => {
      cart.splice(
        Number(button.dataset.remove),
        1
      );

      store.set('nexa_cart', cart);

      updateCartCount();
      openCart();
    };
  });

  const checkoutButton = $('#checkoutBtn');

if (checkoutButton) {
  checkoutButton.disabled =
    !cart.length ||
    PAYMENT_MODE !== 'live';

  checkoutButton.textContent =
    PAYMENT_MODE === 'live'
      ? 'SECURE CHECKOUT'
      : 'CHECKOUT — COMING SOON';
}

const micro =
  $('#cartModal .micro');

if (micro) {
  micro.innerHTML =
    PAYMENT_MODE === 'live'
      ? `Secure payment powered by ${escapeHtml(PAYMENT_PROVIDER)}.`
      : 'Payment setup is being prepared. Checkout is currently unavailable.';
}

openModal('#cartModal');
}
/* =========================================================
   CUSTOMER ACCOUNT
   ========================================================= */
async function getMarketingPreference(userId) {
  const { data, error } = await supabaseClient
    .from('marketing_preferences')
    .select('email_marketing')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('Marketing preference load error:', error);
    return false;
  }

  return data?.email_marketing === true;
}

async function saveMarketingPreference(userId, enabled) {
  const now = new Date().toISOString();

  const { error } = await supabaseClient
    .from('marketing_preferences')
    .upsert(
      {
        user_id: userId,
        email_marketing: enabled,
        consented_at: enabled ? now : null,
        updated_at: now
      },
      {
        onConflict: 'user_id'
      }
    );

  if (error) {
    console.error('Marketing preference save error:', error);
    throw error;
  }
}

async function getCurrentCustomer() {
  const {
    data: { session }
  } = await supabaseClient.auth.getSession();

  const authUser =
    session?.user || null;

  if (!authUser) {
    user = null;
    return null;
  }

  user = {
    id: authUser.id,
    email: authUser.email || '',
    name:
      authUser.user_metadata?.name ||
      'Customer'
  };

  return user;
}

async function loadCustomerOrders(customer) {
  const {
    data: orderRows,
    error: orderError
  } = await supabaseClient
    .from('orders')
    .select(
      'id,total,status,created_at,paid_at,payment_provider,payment_reference'
    )
    .eq('user_id', customer.id)
    .order('created_at', {
      ascending: false
    });

  if (orderError) {
    console.error(
      'Customer orders error:',
      orderError
    );

    return {
      orders: [],
      error: orderError.message
    };
  }

  const orders = orderRows || [];

  if (!orders.length) {
    return {
      orders: [],
      error: null
    };
  }

  const orderIds =
    orders.map(order => order.id);

  const {
    data: ticketRows,
    error: ticketError
  } = await supabaseClient
    .from('tickets')
    .select(
      'id,order_id,competition_id,ticket_number,status,created_at'
    )
    .in('order_id', orderIds)
    .order('id', {
      ascending: true
    });

  if (ticketError) {
    console.error(
      'Customer tickets error:',
      ticketError
    );
  }

  const tickets =
    ticketRows || [];

  return {
    error:
      ticketError
        ? ticketError.message
        : null,

    orders: orders.map(order => ({
      ...order,

      tickets: tickets.filter(
        ticket =>
          ticket.order_id === order.id
      )
    }))
  };
}

function customerOrderCard(order) {
  const date = formatDate(
    order.paid_at ||
    order.created_at
  );

  const status = String(
    order.status || 'pending'
  );

  const total =
    Number(order.total || 0);

  let statusLabel;

  if (total === 0) {
    statusLabel = 'FREE ENTRY';
  } else if (status === 'paid') {
    statusLabel = 'PAID';
  } else {
    statusLabel =
      status.toUpperCase();
  }

  const tickets =
    order.tickets || [];

  const ticketsHtml =
    tickets.length
      ? tickets.map(ticket => {
          const competition =
            competitions.find(
              item =>
                item.id ===
                String(
                  ticket.competition_id
                )
            );

          return `
            <div class="ticket-line">
              <p>
                ${
                  competition
                    ? escapeHtml(
                        competition.title
                      )
                    : 'Competition'
                }
              </p>

              <p>
                Ticket:
                <strong>
                  ${escapeHtml(
                    ticket.ticket_number
                  )}
                </strong>
              </p>
            </div>
          `;
        }).join('')
      : `
          <p class="empty">
            No tickets found for this entry.
          </p>
        `;

  return `
    <div class="order-card">
      <strong>
        ${
          total === 0
            ? 'Free Entry'
            : `Order ${escapeHtml(order.id)}`
        }
      </strong>

      <p>
        ${
          total === 0
            ? 'FREE'
            : money(total)
        }
      </p>

      <small>
        ${escapeHtml(statusLabel)}
        ${
          date
            ? ` · ${escapeHtml(date)}`
            : ''
        }
      </small>

      <details>
        <summary>
          View ticket
        </summary>

        ${ticketsHtml}
      </details>
    </div>
  `;
}

async function renderAccount(
  fromCheckout = false
) {
  await getCurrentCustomer();

 const host = $('#accountContent');

if (!host) return;

let emailMarketingEnabled = false;

if (user) {
  emailMarketingEnabled =
    await getMarketingPreference(user.id);
}

if (!user) {
    host.innerHTML = `
      <p class="eyebrow">
        MY NEXA
      </p>

      <h2>
        ${
          fromCheckout
            ? 'Sign in to continue'
            : 'Customer Account'
        }
      </h2>

      <h3>
        Create Account
      </h3>

      <form id="signupForm">
        <label class="field">
          Name

          <input
            name="name"
            required
            autocomplete="name"
          >
        </label>

        <label class="field">
          Email

          <input
            name="email"
            type="email"
            required
            autocomplete="email"
          >
        </label>

        <label class="field">
          Password

          <input
            name="password"
            type="password"
            minlength="8"
            required
            autocomplete="new-password"
          >
        </label>

</label>

<label
  style="
    display:flex;
    align-items:flex-start;
    gap:10px;
    margin:16px 0;
    font-size:13px;
    line-height:1.5;
    color:#bbb;
    cursor:pointer;
  "
>
  <input
    type="checkbox"
    name="email_marketing"
    value="yes"
    style="
      width:auto;
      margin-top:3px;
      accent-color:#d4af37;
    "
  >

  <span>
    Keep me updated with new draws, prizes and
    Nexa Draw offers by email. I can unsubscribe
    at any time.
  </span>
</label>

<button
  class="btn gold full"
  type="submit"
>
  CREATE ACCOUNT
</button>

      </form>

      <hr>

      <h3>
        Already have an account?
      </h3>

      <form id="loginForm">
        <label class="field">
          Email

          <input
            name="email"
            type="email"
            required
            autocomplete="email"
          >
        </label>

        <label class="field">
          Password

          <input
            name="password"
            type="password"
            required
            autocomplete="current-password"
          >
        </label>

        <button
          class="btn outline full"
          type="submit"
        >
          LOG IN
        </button>
      </form>
    `;

    $('#signupForm').onsubmit =
      async event => {
        event.preventDefault();

        const formData =
          new FormData(event.target);

         const emailMarketing =
  formData.get('email_marketing') === 'yes';

        const { error } =
          await supabaseClient.auth.signUp({
            email: String(
              formData.get('email') || ''
            ).trim(),

            password: String(
              formData.get('password') || ''
            ),

            options: {
            data: {
  name: String(
    formData.get('name') || ''
  ).trim(),

  email_marketing: emailMarketing,

  marketing_consented_at:
    emailMarketing
      ? new Date().toISOString()
      : null
},

              emailRedirectTo:
                window.location.origin + '/'
            }
          });

        if (error) {
          alert(
            'Sign up failed: ' +
            error.message
          );
          return;
        }

        alert(
          'Account created. Please check your email if confirmation is required.'
        );
      };

    $('#loginForm').onsubmit =
      async event => {
        event.preventDefault();

        const formData =
          new FormData(event.target);

        const { error } =
          await supabaseClient.auth
            .signInWithPassword({
              email: String(
                formData.get('email') || ''
              ).trim(),

              password: String(
                formData.get('password') || ''
              )
            });

        if (error) {
          alert(
            'Login failed: ' +
            error.message
          );

          return;
        }

        await updateAccountLabel();

        /*
          FREE DRAW WAS WAITING
          FOR LOGIN.
        */
        if (freeEntryPending) {
          const pendingCompetition =
            freeEntryPending;

          freeEntryPending = null;

          closeModals();

          await enterFreeCompetition(
            pendingCompetition
          );

          return;
        }

        if (checkoutPending) {
          checkoutPending = false;

          closeModals();

          openCart();

          toast(
            'Logged in — you can continue checkout'
          );

          return;
        }

        await renderAccount(false);
      };

    return;
  }

  host.innerHTML = `
    <p class="eyebrow">
      MY NEXA
    </p>

    <h2>
      Welcome,
      ${escapeHtml(user.name)}
    </h2>

    <p>
      ${escapeHtml(user.email)}
    </p>

    <h3>
      Your entries & orders
    </h3>

    <p class="empty">
      Loading your entries...
    </p>

    <button
      class="btn outline full"
      id="logoutBtn"
    >
      LOG OUT
    </button>

  `;

  const {
    orders,
    error
  } =
    await loadCustomerOrders(user);

const activeOrders = [];
const previousOrders = [];

orders.forEach(order => {
  const hasLiveCompetition = (order.tickets || []).some(ticket => {
    const competition = competitions.find(
      item =>
        item.id === String(ticket.competition_id)
    );

    return competition?.status === 'live';
  });

  if (hasLiveCompetition) {
    activeOrders.push(order);
  } else {
    previousOrders.push(order);
  }
});

const activeOrderSection =
  activeOrders.length
    ? activeOrders
        .map(customerOrderCard)
        .join('')
    : `
        <p class="empty">
          ${
            error
              ? 'Your entries could not be loaded. Please try again.'
              : 'You have no active entries.'
          }
        </p>
      `;

const previousOrderSection =
  previousOrders.length
    ? previousOrders
        .map(customerOrderCard)
        .join('')
    : `
        <p class="empty">
          No previous entries yet.
        </p>
      `;
  host.innerHTML = `
    <p class="eyebrow">
      MY NEXA
    </p>

    <h2>
      Welcome,
      ${escapeHtml(user.name)}
    </h2>

    <p>
      ${escapeHtml(user.email)}
    </p>

   <div
  style="
    display:flex;
    gap:10px;
    margin:20px 0;
  "
>
  <button
    type="button"
    class="btn gold"
    id="activeEntriesTab"
    style="flex:1;"
  >
    ACTIVE ENTRIES
  </button>

  <button
    type="button"
    class="btn outline"
    id="previousHistoryTab"
    style="flex:1;"
  >
    PREVIOUS HISTORY
  </button>
</div>

<div
  style="
    margin:18px 0 24px;
    padding:16px;
    border:1px solid rgba(212,175,55,.35);
    border-radius:12px;
  "
>
  <strong>Email preferences</strong>

    <label
  style="
    display:flex;
    align-items:flex-start;
    gap:10px;
    margin-top:12px;
    cursor:pointer;
  "
>
  <input
    type="checkbox"
    id="marketingPreference"
    ${emailMarketingEnabled ? 'checked' : ''}
    style="
      width:24px;
      height:24px;
      min-width:24px;
      margin-top:1px;
      accent-color:#d4af37;
      cursor:pointer;
    "
  >

    <span>
      Email me about new draws, prizes and
      Nexa Draw offers. I can unsubscribe at any time.
    </span>
  </label>
</div>

   <div id="activeEntriesSection">
  ${activeOrderSection}
</div>

<div
  id="previousHistorySection"
  style="display:none;"
>
  ${previousOrderSection}
</div>

    <button
      class="btn outline full"
      id="logoutBtn"
    >
      LOG OUT
    </button>
  `;

const activeEntriesTab = $('#activeEntriesTab');
const previousHistoryTab = $('#previousHistoryTab');

const activeEntriesSection = $('#activeEntriesSection');
const previousHistorySection = $('#previousHistorySection');

activeEntriesTab?.addEventListener('click', () => {
  activeEntriesSection.style.display = '';
  previousHistorySection.style.display = 'none';

  activeEntriesTab.classList.add('gold');
  activeEntriesTab.classList.remove('outline');

  previousHistoryTab.classList.add('outline');
  previousHistoryTab.classList.remove('gold');
});

previousHistoryTab?.addEventListener('click', () => {
  activeEntriesSection.style.display = 'none';
  previousHistorySection.style.display = '';

  previousHistoryTab.classList.add('gold');
  previousHistoryTab.classList.remove('outline');

  activeEntriesTab.classList.add('outline');
  activeEntriesTab.classList.remove('gold');
});

   const marketingPreference =
  $('#marketingPreference');
   
   if (marketingPreference) {
  marketingPreference.onchange =
    async event => {
      const enabled = event.target.checked;

      event.target.disabled = true;

      try {
        await saveMarketingPreference(
          user.id,
          enabled
        );

        toast(
          enabled
            ? 'Email updates enabled'
            : 'Email updates disabled'
        );
      } catch {
        event.target.checked = !enabled;

        alert(
          'Could not save your email preference. Please try again.'
        );
      } finally {
        event.target.disabled = false;
      }
    };
}
   
  $('#logoutBtn').onclick =
    async () => {
      await supabaseClient.auth.signOut();

      user = null;
      checkoutPending = false;
      freeEntryPending = null;

      await updateAccountLabel();
      await renderAccount(false);
    };
}

async function updateAccountLabel() {
  await getCurrentCustomer();

  const label =
    $('#accountLabel');

  if (!label) return;

  label.textContent = user
    ? (user.name || 'Customer')
        .split(' ')[0]
    : 'My Account';
}


/* =========================================================
   CHECKOUT
   ========================================================= */

async function checkout() {
  /*
    FREE COMPETITIONS ARE NOT
    SENT THROUGH CHECKOUT.
  */
  cart = store
    .get('nexa_cart', [])
    .filter(
      item =>
        competitions.some(
          competition =>
            competition.id ===
              String(item.id) &&
            competition.status ===
              'live' &&
            !isFreeCompetition(
              competition
            )
        )
    );

  store.set('nexa_cart', cart);
  updateCartCount();

  if (!cart.length) {
    toast(
      'Your basket has no paid competitions.'
    );

    return;
  }

  const authUser =
    await getCurrentCustomer();

  if (!authUser) {
    checkoutPending = true;

    closeModals();

    await renderAccount(true);

    openModal('#accountModal');

    return;
  }

  /*
  
  PAID CHECKOUT:
  When payment mode is live, authenticated
  customers can continue to Nochex.
*/
if (PAYMENT_MODE !== 'live') {
  alert(
    'Checkout is coming soon.'
  );

  return;
}
    
  /*
    NOCHEX BILLING DETAILS

    These fields have been confirmed
    by Nochex as mandatory for our
    merchant configuration.
  */
  closeModals();

  let billingModal =
    $('#nochexBillingModal');

  if (!billingModal) {
    document.body.insertAdjacentHTML(
      'beforeend',
      `
        <div
          class="modal"
          id="nochexBillingModal"
        >
          <div class="modal-card">

            <button
              class="modal-close"
              type="button"
              id="closeNochexBilling"
              aria-label="Close checkout"
            >
              ×
            </button>

            <h2>
              Billing Details
            </h2>

            <p class="micro">
              Enter the billing details
              associated with your payment card.
            </p>

            <form id="nochexBillingForm" class="nochex-billing-form">

              <label>
                First name
                <input
                  type="text"
                  id="nochexGivenName"
                  autocomplete="given-name"
                  required
                >
              </label>

              <label>
                Surname
                <input
                  type="text"
                  id="nochexSurname"
                  autocomplete="family-name"
                  required
                >
              </label>

              <label>
                Phone number
                <input
                  type="tel"
                  id="nochexPhone"
                  autocomplete="tel"
                  required
                >
              </label>

              <label>
                Address line 1
                <input
                  type="text"
                  id="nochexStreet1"
                  autocomplete="address-line1"
                  required
                >
              </label>

              <label>
                City
                <input
                  type="text"
                  id="nochexCity"
                  autocomplete="address-level2"
                  required
                >
              </label>

              <label>
                Postcode
                <input
                  type="text"
                  id="nochexPostcode"
                  autocomplete="postal-code"
                  required
                >
              </label>

              <button
                class="btn primary"
                type="submit"
                id="continueNochexPayment"
              >
                CONTINUE TO PAYMENT
              </button>

            </form>

          </div>
        </div>
      `
    );

    billingModal =
      $('#nochexBillingModal');

    $('#closeNochexBilling')
      ?.addEventListener(
        'click',
        () => {
          closeModals();
        }
      );
  }

  /*
    Pre-fill the customer's name where
    possible, but still allow them to
    enter/correct the billing name.
  */
  const customerName =
    String(
      authUser.name ||
      authUser.user_metadata
        ?.full_name ||
      authUser.user_metadata
        ?.name ||
      ''
    ).trim();

  if (customerName) {
    const nameParts =
      customerName.split(/\s+/);

    const firstName =
      nameParts.shift() || '';

    const surname =
      nameParts.join(' ');

    const givenNameInput =
      $('#nochexGivenName');

    const surnameInput =
      $('#nochexSurname');

    if (
      givenNameInput &&
      !givenNameInput.value
    ) {
      givenNameInput.value =
        firstName;
    }

    if (
      surnameInput &&
      !surnameInput.value
    ) {
      surnameInput.value =
        surname;
    }
  }

  openModal('#nochexBillingModal');

  const billingForm =
    $('#nochexBillingForm');

  if (!billingForm) {
    alert(
      'Billing form could not be loaded.'
    );

    return;
  }

  /*
    Replace any previous submit handler
    by cloning the form.
  */
  const freshBillingForm =
    billingForm.cloneNode(true);

  billingForm.replaceWith(
    freshBillingForm
  );

  freshBillingForm.addEventListener(
    'submit',
    async event => {
      event.preventDefault();

      const givenName =
        $('#nochexGivenName')
          ?.value.trim();

      const surname =
        $('#nochexSurname')
          ?.value.trim();

      const phone =
        $('#nochexPhone')
          ?.value.trim();

      const street1 =
        $('#nochexStreet1')
          ?.value.trim();

      const city =
        $('#nochexCity')
          ?.value.trim();

      const postcode =
        $('#nochexPostcode')
          ?.value.trim()
          .toUpperCase();

      if (
        !givenName ||
        !surname ||
        !phone ||
        !street1 ||
        !city ||
        !postcode
      ) {
        alert(
          'Please complete all billing details.'
        );

        return;
      }

      const continueButton =
        $('#continueNochexPayment');

      try {
        if (continueButton) {
          continueButton.disabled =
            true;

          continueButton.textContent =
            'CREATING CHECKOUT...';
        }

        /*
          STEP 1:
          Create secure pending order.
        */
        const items =
          cart.map(item => ({
            competition_id:
              Number(item.id),

            quantity:
              Number(item.qty)
          }));

        const {
          data: orderData,
          error: orderError
        } =
          await supabaseClient
            .functions.invoke(
              'create-order',
              {
                body: { items }
              }
            );

        if (orderError) {
          console.error(
            'Create order error:',
            orderError
          );

          alert(
            await functionErrorMessage(
              orderError,
              'The secure order could not be created.'
            )
          );

          return;
        }

        if (
          !orderData?.success ||
          !orderData?.order?.id
        ) {
          alert(
            orderData?.error ||
            'The secure order could not be created.'
          );

          return;
        }

        const orderId =
          orderData.order.id;

const orderTotal =
  Number(
    orderData.order.total
  );

if (
  !Number.isFinite(orderTotal) ||
  orderTotal <= 0
) {
  throw new Error(
    'Invalid order total'
  );
}
         
        /*
          STEP 2:
          Create the Nochex checkout
          with the customer's real
          billing/contact details.
        */
        const {
          data: nochexData,
          error: nochexError
        } =
          await supabaseClient
            .functions.invoke(
              'create-nochex-checkout',
              {
                body: {
                  order_id:
                    orderId,

                  given_name:
                    givenName,

                  surname:
                    surname,

                  phone:
                    phone,

                  billing_street1:
                    street1,

                  billing_city:
                    city,

                  billing_postcode:
                    postcode
                }
              }
            );

        if (nochexError) {
          console.error(
            'Nochex checkout error:',
            nochexError
          );

          alert(
            await functionErrorMessage(
              nochexError,
              'The Nochex checkout could not be created.'
            )
          );

          return;
        }

        if (
          !nochexData?.success ||
          !nochexData?.checkout_id
        ) {
          console.error(
            'Invalid Nochex response:',
            nochexData
          );

          alert(
            nochexData?.error ||
            'The Nochex checkout could not be created.'
          );

          return;
        }

        /*
          STEP 3:
          Render Nochex CopyPay
          production widget.

          Returning to the website is
          NOT proof of payment.
          Server-side verification is
          handled separately.
        */
        closeModals();

        let paymentModal =
          $('#nochexPaymentModal');

        if (!paymentModal) {
          document.body
            .insertAdjacentHTML(
              'beforeend',
              `
                <div
                  class="modal"
                  id="nochexPaymentModal"
                >
                  <div class="modal-card">

                    <button
                      class="modal-close"
                      type="button"
                      id="closeNochexPayment"
                      aria-label="Close payment"
                    >
                      ×
                    </button>

                    <h2>
                      Secure Payment
                    </h2>

                    <p class="micro">
                      Complete your payment
                      securely with Nochex.
                    </p>

                    <div
                      id="nochexWidgetContainer"
                    ></div>

                  </div>
                </div>
              `
            );

          paymentModal =
            $('#nochexPaymentModal');

          $('#closeNochexPayment')
            ?.addEventListener(
              'click',
              () => {
                closeModals();
              }
            );
        }

        const widgetContainer =
          $('#nochexWidgetContainer');

        if (!widgetContainer) {
          throw new Error(
            'Payment container missing'
          );
        }

       /*
  Apple Pay configuration must exist
  before the CopyPay widget script loads.
*/

     
         window.wpwlOptions = {
  applePay: {
    version: 3,
    checkAvailability: 'canMakePayments',
    buttonSource: 'js',
    buttonStyle: 'white-outline',
    buttonType: 'buy',
    displayName: 'Nexa Draw',
    total: orderTotal.toFixed(2),
    currencyCode: 'GBP',
    merchantCapabilities: [
      'supports3DS'
    ],
    supportedNetworks: [
      'masterCard',
      'visa'
    ]
  }
};

widgetContainer.innerHTML = `
  <form
    action="${window.location.origin}/?payment=return"
    class="paymentWidgets"
    data-brands="VISA MASTER APPLEPAY"
  ></form>
`;

        /*
          Remove an old widget script
          before loading the new checkout.
        */
        $('#nochexWidgetScript')
          ?.remove();

        const script =
          document.createElement(
            'script'
          );

        script.id =
          'nochexWidgetScript';

        script.src =
          nochexData
            .payment_widget_url;

        script.async = true;

        script.onerror = () => {
          console.error(
            'Nochex payment widget failed to load'
          );

          alert(
            'The Nochex payment form could not be loaded.'
          );
        };

        document.body.appendChild(
          script
        );

        openModal(
          '#nochexPaymentModal'
        );
      } catch (error) {
        console.error(
          'Checkout error:',
          error
        );

        alert(
          'The checkout could not be started.'
        );
      } finally {
        if (continueButton) {
          continueButton.disabled =
            false;

          continueButton.textContent =
            'CONTINUE TO PAYMENT';
        }
      }
    }
  );
}

/* =========================================================
   WINNERS
   ========================================================= */

async function renderWinners() {
  const host =
    $('#winnerGrid');

  if (!host) return;

  const { data, error } =
    await supabaseClient.rpc(
      'get_public_winners'
    );

  if (error) {
    console.error(
      'Public winners error:',
      error
    );

    host.innerHTML = `
      <p class="empty">
        Winners could not be loaded.
      </p>
    `;

    return;
  }

  const publicWinners =
    Array.isArray(data)
      ? data
      : [];

  host.innerHTML =
    publicWinners.length
      ? publicWinners.map(
          winner => `
            <article class="winner-card">
              <span>🏆</span>

              <h3>
                ${escapeHtml(
                  winner.prize
                )}
              </h3>

              <p>
                Winner:
                <strong>
                  ${escapeHtml(
                    winner.winner_name || 'Winner'
                  )}
                </strong>
              </p>

              <p>
                Ticket:
                <strong>
                  ${escapeHtml(
                    winner.ticket_number
                  )}
                </strong>
              </p>

              <small>
                ${formatDate(
                  winner.drawn_at
                )}
              </small>
            </article>
          `
        ).join('')
      : `
          <p class="empty">
            No winners have been published yet.
          </p>
        `;
}


/* =========================================================
   SECURE WINNER DRAW
   ========================================================= */

async function drawWinnerSecurely(id) {
  if (!(await isAdminSession())) {
    alert('Administrator access required.');
    return;
  }

  const competition = competitions.find(
    item => item.id === String(id)
  );

  if (!competition) {
    alert('Competition could not be found.');
    return;
  }

  const confirmed = window.confirm(
    `Draw a winner for "${competition.title}"?\n\n` +
    'The secure server will select the winning ticket. ' +
    'The Draw Room animation will then reveal that result.'
  );

  if (!confirmed) return;

  /*
    Open the Draw Room BEFORE calling the server.

    IMPORTANT:
    The animation does NOT choose the winner.
    The server-side draw-winner function does.
  */
  openNexaDrawRoom(competition);

  setDrawRoomStatus(
    'SECURELY SELECTING WINNER...'
  );

  try {
    const { data, error } =
      await supabaseClient.functions.invoke(
        'draw-winner',
        {
          body: {
            competition_id: competition.id
          }
        }
      );

    if (error) {
      console.error(
        'Winner draw error:',
        error
      );

      closeNexaDrawRoom();

      alert(
        await functionErrorMessage(
          error,
          'Secure winner draw failed. No new winner has been selected.'
        )
      );

      return;
    }

    if (!data?.winner) {
      closeNexaDrawRoom();

      alert(
        data?.message ||
        'No eligible tickets were found.'
      );

      return;
    }

    /*
      THIS is the authoritative winner returned
      by the secure server-side draw.
    */
    const winner = data.winner;

    const winnerName =
      winner.winner_name ||
      winner.name ||
      winner.customer_name ||
      'Winner';

    const winningTicket =
      winner.ticket_number ||
      winner.ticket ||
      winner.number ||
      '';

    const winnerEmail =
      winner.winner_email ||
      winner.email ||
      '';

    /*
      Run the visual spinner for about 5 seconds
      and land on the REAL server-selected ticket.
    */
    await runNexaWinnerSpinner({
      competition,
      winnerName,
      winningTicket,
      winnerEmail
    });

    /*
      Refresh public/admin information only after
      the reveal has completed.
    */
    await renderWinners();

    await loadCompetitionsFromSupabase();

    toast('Winner drawn and published');

  } catch (error) {
    console.error(
      'Draw Room error:',
      error
    );

    closeNexaDrawRoom();

    alert(
      'The winner draw could not be completed.'
    );
  }

}

/* =========================================================
   NEXA DRAW — ADMIN DRAW ROOM
   ========================================================= */

let nexaDrawRoomTimer = null;

function ensureNexaDrawRoom() {
  if ($('#nexaDrawRoom')) return;

  document.body.insertAdjacentHTML(
    'beforeend',
    `
      <div id="nexaDrawRoom" class="nexa-draw-room">

        <style>
          .nexa-draw-room {
            position: fixed;
            inset: 0;
            z-index: 999999;
            display: none;
            align-items: center;
            justify-content: center;
            padding: 20px;
            background:
              radial-gradient(
                circle at center,
                #24200f 0%,
                #0d0d0d 45%,
                #000 100%
              );
            color: #fff;
          }

          .nexa-draw-room.show {
            display: flex;
          }

          .nexa-draw-room-inner {
            width: min(760px, 100%);
            text-align: center;
          }

          .nexa-draw-room-brand {
            margin-bottom: 8px;
            color: #d4af37;
            font-size: 14px;
            font-weight: 900;
            letter-spacing: 5px;
          }

          .nexa-draw-room h1 {
            margin: 0 0 10px;
            color: #fff;
            font-size: clamp(30px, 7vw, 58px);
            line-height: 1;
          }

          .nexa-draw-room-title {
            margin: 0 auto 30px;
            max-width: 620px;
            color: #aaa;
            font-size: 16px;
          }

          .nexa-spinner-frame {
            position: relative;
            overflow: hidden;
            margin: 25px auto;
            padding: 3px;
            border-radius: 20px;
            background:
              linear-gradient(
                135deg,
                #8f6b12,
                #f6d365,
                #8f6b12
              );
            box-shadow:
              0 0 45px rgba(212, 175, 55, 0.22);
          }

          .nexa-spinner-window {
            position: relative;
            display: flex;
            min-height: 155px;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            border-radius: 17px;
            background: #070707;
          }

          .nexa-spinner-window::before,
          .nexa-spinner-window::after {
            content: "";
            position: absolute;
            left: 0;
            right: 0;
            z-index: 2;
            height: 45px;
            pointer-events: none;
          }

          .nexa-spinner-window::before {
            top: 0;
            background:
              linear-gradient(
                to bottom,
                #070707,
                transparent
              );
          }

          .nexa-spinner-window::after {
            bottom: 0;
            background:
              linear-gradient(
                to top,
                #070707,
                transparent
              );
          }

          .nexa-spinner-ticket {
            position: relative;
            z-index: 1;
            padding: 30px 15px;
            color: #d4af37;
            font-family: monospace;
            font-size: clamp(34px, 9vw, 70px);
            font-weight: 900;
            letter-spacing: 5px;
            text-shadow:
              0 0 22px rgba(212, 175, 55, 0.35);
          }

          .nexa-spinner-ticket.spinning {
            animation:
              nexaTicketPulse 0.12s linear infinite;
          }

          @keyframes nexaTicketPulse {
            0% {
              opacity: 0.4;
              transform: translateY(-8px);
            }

            50% {
              opacity: 1;
              transform: translateY(0);
            }

            100% {
              opacity: 0.4;
              transform: translateY(8px);
            }
          }

          .nexa-draw-status {
            min-height: 24px;
            margin-top: 18px;
            color: #d4af37;
            font-size: 13px;
            font-weight: 900;
            letter-spacing: 2px;
          }

          .nexa-winner-result {
            display: none;
            margin-top: 25px;
            padding: 25px;
            border: 1px solid rgba(212, 175, 55, 0.45);
            border-radius: 16px;
            background: rgba(212, 175, 55, 0.06);
          }

          .nexa-winner-result.show {
            display: block;
            animation: nexaWinnerReveal 0.7s ease;
          }

          @keyframes nexaWinnerReveal {
            from {
              opacity: 0;
              transform: scale(0.9);
            }

            to {
              opacity: 1;
              transform: scale(1);
            }
          }

          .nexa-winner-trophy {
            font-size: 55px;
          }

          .nexa-winner-result h2 {
            margin: 5px 0;
            color: #d4af37;
            font-size: clamp(28px, 6vw, 45px);
          }

          .nexa-winner-name {
            margin: 12px 0 5px;
            color: #fff;
            font-size: 24px;
            font-weight: 900;
          }

          .nexa-winner-ticket {
            margin-bottom: 20px;
            color: #d4af37;
            font-family: monospace;
            font-size: 18px;
            font-weight: 900;
          }

          .nexa-draw-actions {
            display: flex;
            justify-content: center;
            gap: 10px;
            flex-wrap: wrap;
            margin-top: 20px;
          }

          .nexa-draw-room button {
            min-width: 160px;
          }

          @media (max-width: 520px) {
            .nexa-draw-room {
              padding: 14px;
            }

            .nexa-spinner-ticket {
              letter-spacing: 2px;
            }

            .nexa-draw-actions {
              display: grid;
              grid-template-columns: 1fr;
            }

            .nexa-draw-actions button,
            .nexa-draw-actions a {
              width: 100%;
            }
          }
        </style>

        <div class="nexa-draw-room-inner">

          <div class="nexa-draw-room-brand">
            NEXA DRAW
          </div>

          <h1>
            WINNER DRAW
          </h1>

          <p
            class="nexa-draw-room-title"
            id="nexaDrawCompetition"
          ></p>

          <div class="nexa-spinner-frame">
            <div class="nexa-spinner-window">

              <div
                class="nexa-spinner-ticket"
                id="nexaSpinnerTicket"
              >
                ----------
              </div>

            </div>
          </div>

          <div
            class="nexa-draw-status"
            id="nexaDrawStatus"
          >
            PREPARING SECURE DRAW...
          </div>

          <div
            class="nexa-winner-result"
            id="nexaWinnerResult"
          >

            <div class="nexa-winner-trophy">
              🏆
            </div>

            <h2>
              WINNER
            </h2>

            <div
              class="nexa-winner-name"
              id="nexaWinnerName"
            >
              Winner
            </div>

            <div
              class="nexa-winner-ticket"
              id="nexaWinnerTicket"
            ></div>

            <div class="nexa-draw-actions">

              <a
                class="btn gold"
                id="nexaContactWinner"
                href="#"
              >
                CONTACT WINNER
              </a>

              <button
                class="btn outline"
                id="nexaBackToAdmin"
                type="button"
              >
                BACK TO ADMIN
              </button>

            </div>

          </div>

        </div>
      </div>
    `
  );

  $('#nexaBackToAdmin')?.addEventListener(
    'click',
    async () => {
      closeNexaDrawRoom();

      await adminView();

      openModal('#adminModal');
    }
  );
}


function openNexaDrawRoom(competition) {
  ensureNexaDrawRoom();

  if (nexaDrawRoomTimer) {
    clearTimeout(nexaDrawRoomTimer);
    nexaDrawRoomTimer = null;
  }

  const room =
    $('#nexaDrawRoom');

  const competitionHost =
    $('#nexaDrawCompetition');

  const ticketHost =
    $('#nexaSpinnerTicket');

  const result =
    $('#nexaWinnerResult');

  const contact =
    $('#nexaContactWinner');

  if (competitionHost) {
    competitionHost.textContent =
      competition?.title || 'Competition';
  }

  if (ticketHost) {
    ticketHost.textContent = '----------';
    ticketHost.classList.remove('spinning');
  }

  if (result) {
    result.classList.remove('show');
  }

  if (contact) {
    contact.style.display = 'none';
    contact.removeAttribute('href');
  }

  setDrawRoomStatus(
    'PREPARING SECURE DRAW...'
  );

  if (room) {
    room.classList.add('show');
  }

  document.body.style.overflow = 'hidden';
}


function closeNexaDrawRoom() {
  if (nexaDrawRoomTimer) {
    clearTimeout(nexaDrawRoomTimer);
    nexaDrawRoomTimer = null;
  }

  const room =
    $('#nexaDrawRoom');

  room?.classList.remove('show');

  document.body.style.overflow = '';
}


function setDrawRoomStatus(message) {
  const host =
    $('#nexaDrawStatus');

  if (host) {
    host.textContent = message;
  }
}


function randomSpinnerTicket(length = 10) {
  const characters =
    '0123456789ABCDEF';

  let result = '';

  for (let i = 0; i < length; i += 1) {
    result += characters[
      Math.floor(
        Math.random() * characters.length
      )
    ];
  }

  return result;
}


function waitForDrawRoom(milliseconds) {
  return new Promise(resolve => {
    nexaDrawRoomTimer =
      setTimeout(
        resolve,
        milliseconds
      );
  });
}


async function runNexaWinnerSpinner({
  competition,
  winnerName,
  winningTicket,
  winnerEmail
}) {
  ensureNexaDrawRoom();

  const ticketHost =
    $('#nexaSpinnerTicket');

  const resultHost =
    $('#nexaWinnerResult');

  const nameHost =
    $('#nexaWinnerName');

  const winnerTicketHost =
    $('#nexaWinnerTicket');

  const contactHost =
    $('#nexaContactWinner');

  if (!ticketHost) return;

  /*
    These changing numbers are VISUAL ONLY.

    They are NOT real entrants and are NOT used
    to determine the winner.

    The real winner has already been selected
    securely by the server.
  */

  ticketHost.classList.add('spinning');

  setDrawRoomStatus(
    'SECURE DRAW IN PROGRESS...'
  );

  const started =
    Date.now();

  const duration =
    5000;

  while (
    Date.now() - started < duration
  ) {
    const elapsed =
      Date.now() - started;

    const progress =
      elapsed / duration;

    ticketHost.textContent =
      randomSpinnerTicket(
        Math.max(
          6,
          String(
            winningTicket || ''
          ).length || 10
        )
      );

    /*
      Gradually slow the animation.
    */
    const delay =
      45 +
      Math.floor(
        Math.pow(progress, 3) * 430
      );

    await waitForDrawRoom(delay);
  }

  ticketHost.classList.remove(
    'spinning'
  );

  /*
    LAND ON THE EXACT SERVER WINNER.
  */
  ticketHost.textContent =
    winningTicket || 'WINNER';

  setDrawRoomStatus(
    'WINNING TICKET CONFIRMED'
  );

  await waitForDrawRoom(650);

  if (nameHost) {
    nameHost.textContent =
      winnerName || 'Winner';
  }

  if (winnerTicketHost) {
    winnerTicketHost.textContent =
      winningTicket
        ? `TICKET ${winningTicket}`
        : 'WINNING ENTRY';
  }

  /*
    Build the Contact Winner email locally.
  */
  if (
    contactHost &&
    winnerEmail
  ) {
    const subject =
      `Nexa Draw Winner - ${
        competition?.title ||
        'Competition'
      }`;

    const body =
      `Hi ${winnerName || 'Winner'},\n\n` +
      `Congratulations! You have been drawn as the winner of ${
        competition?.title ||
        'the Nexa Draw competition'
      }.\n\n` +
      (
        winningTicket
          ? `Your winning ticket number is: ${winningTicket}\n\n`
          : ''
      ) +
      `Please reply to this email so we can arrange your prize.\n\n` +
      `Kind regards,\n` +
      `Nexa Draw`;

    contactHost.href =
      `mailto:${encodeURIComponent(
        winnerEmail
      )}` +
      `?subject=${encodeURIComponent(
        subject
      )}` +
      `&body=${encodeURIComponent(
        body
      )}`;

    contactHost.style.display =
      '';
  }

  resultHost?.classList.add(
    'show'
  );
}

/* =========================================================
   ADMIN
   ========================================================= */

async function openSecureAdmin() {
  closeModals();

  const host =
    $('#adminContent');

  if (!host) return;

  if (await isAdminSession()) {
    await adminView();

    openModal('#adminModal');

    return;
  }

  host.innerHTML = `
    <p class="eyebrow">
      NEXA DRAW
    </p>

    <h2>
      Administrator
    </h2>

    <form id="adminLoginForm">
      <label class="field">
        Email

        <input
          name="email"
          type="email"
          autocomplete="email"
          required
        >
      </label>

      <label class="field">
        Password

        <input
          name="password"
          type="password"
          autocomplete="current-password"
          required
        >
      </label>

      <button
        class="btn gold full"
        type="submit"
      >
        ADMIN LOG IN
      </button>
    </form>
  `;

  openModal('#adminModal');

  $('#adminLoginForm').onsubmit =
    async event => {
      event.preventDefault();

      const formData =
        new FormData(event.target);

      const { data, error } =
        await supabaseClient.auth
          .signInWithPassword({
            email: String(
              formData.get('email') || ''
            ).trim(),

            password: String(
              formData.get('password') || ''
            )
          });

      if (error) {
        alert(
          'Admin login failed: ' +
          error.message
        );

        return;
      }

      if (
        data?.user?.id !== ADMIN_UID
      ) {
        await supabaseClient.auth
          .signOut();

        alert(
          'Administrator access required.'
        );

        return;
      }

      await updateAccountLabel();

      await adminView();
    };
}


async function getCorrectAnswerLetter(
  competition
) {
  if (!competition?.id) return 'A';

  const { data, error } =
    await supabaseClient
      .from(
        'competition_skill_answers'
      )
      .select('correct_answer')
      .eq(
        'competition_id',
        competition.id
      )
      .maybeSingle();

  if (
    error ||
    !data?.correct_answer
  ) {
    return 'A';
  }

  const answer =
    String(data.correct_answer);

  if (
    answer ===
    competition.skill_option_b
  ) {
    return 'B';
  }

  if (
    answer ===
    competition.skill_option_c
  ) {
    return 'C';
  }

  return 'A';
}


/* =========================================================
   ADMIN WINNERS
   ========================================================= */

function winnerContactLink(winner) {
  const email =
    String(
      winner?.winner_email || ''
    ).trim();

  if (!email) {
    return '';
  }

  const name =
    winner?.winner_name ||
    'Winner';

  const competition =
    winner?.competition_title ||
    'Competition';

  const ticket =
    winner?.ticket_number ||
    '';

  const subject =
    `Nexa Draw Winner - ${competition}`;

  const body =
    `Hi ${name},\n\n` +
    `Congratulations! You have been drawn as the winner of ${competition}.\n\n` +
    `Your winning ticket number is: ${ticket}\n\n` +
    `Please reply to this email so we can arrange your prize.\n\n` +
    `Kind regards,\n` +
    `Nexa Draw`;

  return (
    `mailto:${encodeURIComponent(email)}` +
    `?subject=${encodeURIComponent(subject)}` +
    `&body=${encodeURIComponent(body)}`
  );
}

async function loadAdminWinners() {
  if (!(await isAdminSession())) {
    return [];
  }

  const { data, error } =
    await supabaseClient.rpc(
      'get_admin_winners'
    );

  if (error) {
    console.error(
      'Admin winners error:',
      error
    );

    return [];
  }

  return Array.isArray(data)
    ? data
    : [];
}


/* =========================================================
   ADMIN DASHBOARD
   ========================================================= */

async function adminView(
  editId = null
) {
  if (!(await isAdminSession())) {
    const host =
      $('#adminContent');

    if (host) {
      host.innerHTML = `
        <p class="empty">
          Administrator access required.
        </p>
      `;
    }

    return;
  }

  await loadCompetitionsFromSupabase();

  const adminWinners =
    await loadAdminWinners();

  const edit =
    editId
      ? competitions.find(
          item =>
            item.id ===
            String(editId)
        )
      : null;

  const selectedCorrect =
    edit
      ? await getCorrectAnswerLetter(
          edit
        )
      : 'A';

  const host =
    $('#adminContent');

  if (!host) return;

  host.innerHTML = `
    <div class="admin-head">
      <div>
        <p class="eyebrow">
          NEXA DRAW
        </p>

        <h2>
          Admin Dashboard
        </h2>
      </div>

      <button
        class="btn outline"
        id="adminLogout"
      >
        LOG OUT
      </button>
    </div>


    <div class="admin-grid">

      <!-- ADD / EDIT COMPETITION -->

      <div>
        <h3>
          ${
            edit
              ? 'Edit competition'
              : 'Add competition'
          }
        </h3>

        <form id="competitionForm">

          <input
            type="hidden"
            name="id"
            value="${escapeHtml(
              edit?.id || ''
            )}"
          >


          <label class="field">
            Title

            <input
              name="title"
              required
              value="${escapeHtml(
                edit?.title || ''
              )}"
            >
          </label>


          <label class="field">
            Price

            <input
              name="price"
              type="number"
              min="0"
              step="0.01"
              required
              value="${escapeHtml(
                edit?.price ?? ''
              )}"
            >

            <small>
              Enter 0.00 to create a
              FREE DRAW.
            </small>
          </label>


          <label class="field">
            Maximum entries

            <input
              name="max_entries"
              type="number"
              min="1"

                            required
              value="${escapeHtml(
                edit?.max ?? ''
              )}"
            >
          </label>


          <label class="field">
            Closing date

            <input
              name="closes_at"
              type="datetime-local"
              value="${escapeHtml(
                edit?.closes
                  ? new Date(
                      edit.closes
                    )
                      .toISOString()
                      .slice(0, 16)
                  : ''
              )}"
            >
          </label>


          <label class="field">
            Description

            <textarea
              name="description"
              rows="4"
            >${escapeHtml(
              edit?.description || ''
            )}</textarea>
          </label>


          <label class="field">
            Competition image

            <input
              name="image"
              type="file"
              accept="image/*"
            >
          </label>


          ${
            edit?.image
              ? `
                <p class="micro">
                  Current image is already saved.
                  Upload another image only
                  to replace it.
                </p>
              `
              : ''
          }


          <label class="field">
            Skill question

            <input
              name="skill_question"
              required
              value="${escapeHtml(
                edit?.skill_question || ''
              )}"
            >
          </label>


          <label class="field">
            Option A

            <input
              name="skill_option_a"
              required
              value="${escapeHtml(
                edit?.skill_option_a || ''
              )}"
            >
          </label>


          <label class="field">
            Option B

            <input
              name="skill_option_b"
              required
              value="${escapeHtml(
                edit?.skill_option_b || ''
              )}"
            >
          </label>


          <label class="field">
            Option C

            <input
              name="skill_option_c"
              required
              value="${escapeHtml(
                edit?.skill_option_c || ''
              )}"
            >
          </label>


          <label class="field">
            Correct answer

            <select
              name="correct_answer_letter"
              required
            >

              <option
                value="A"
                ${
                  selectedCorrect === 'A'
                    ? 'selected'
                    : ''
                }
              >
                Option A
              </option>

              <option
                value="B"
                ${
                  selectedCorrect === 'B'
                    ? 'selected'
                    : ''
                }
              >
                Option B
              </option>

              <option
                value="C"
                ${
                  selectedCorrect === 'C'
                    ? 'selected'
                    : ''
                }
              >
                Option C
              </option>

            </select>
          </label>


          <label class="field">
            Status

            <select name="status">

              <option
                value="live"
                ${
                  edit?.status === 'live'
                    ? 'selected'
                    : ''
                }
              >
                Live
              </option>

              <option
                value="paused"
                ${
                  edit?.status === 'paused'
                    ? 'selected'
                    : ''
                }
              >
                Paused
              </option>

              <option
                value="closed"
                ${
                  edit?.status === 'closed'
                    ? 'selected'
                    : ''
                }
              >
                Closed
              </option>

            </select>
          </label>


          <button
            class="btn gold full"
            type="submit"
          >
            ${
              edit
                ? 'SAVE CHANGES'
                : 'ADD COMPETITION'
            }
          </button>

        </form>
      </div>


      <!-- MANAGE DRAWS -->

      <div>
        <h3>
          Manage draws
        </h3>

        <div class="admin-list">

          ${
            competitions.length
              ? competitions.map(
                  competition => `
                    <div class="admin-row">

                      <div>

                        <strong>
                          ${escapeHtml(
                            competition.title
                          )}
                        </strong>

                        <small>
                          ${
                            isFreeCompetition(
                              competition
                            )
                              ? 'FREE'
                              : money(
                                  competition.price
                                )
                          }

                          ·

                          ${competition.sold}
                          /
                          ${competition.max}

                          ·

                          ${escapeHtml(
                            String(
                              competition.status ||
                              'live'
                            ).toUpperCase()
                          )}
                        </small>

                      </div>


                      <div>

                        <button
                          class="btn outline"
                          data-edit="${competition.id}"
                        >
                          Edit
                        </button>


                        <button
                          class="btn outline"
                          data-winner="${competition.id}"
                        >
                          Draw Winner
                        </button>


                        <button
                          class="btn outline"
                          data-close-competition="${competition.id}"
                          ${
                            competition.status ===
                            'closed'
                              ? 'disabled'
                              : ''
                          }
                        >
                          ${
                            competition.status ===
                            'closed'
                              ? 'Closed'
                              : 'Close Competition'
                          }
                        </button>

                      </div>

                    </div>
                  `
                ).join('')
              : `
                  <p class="empty">
                    No competitions.
                  </p>
                `
                   }

        </div>
      </div>

      <!-- MARKETING EMAIL -->

      <div
        style="
          margin-top: 24px;
          padding-top: 20px;
          border-top: 1px solid rgba(255,255,255,0.12);
        "
      >
        <h3>
          Marketing
        </h3>

        <p class="micro">
          Send the current Pokémon draw
          announcement to opted-in customers.
        </p>

        <button
          class="btn outline"
          type="button"
          id="sendMarketingEmail"
        >
          SEND MARKETING EMAIL
        </button>
      </div>

    </div>


    <!-- POSTAL FREE ENTRY -->

    <div style="margin-top: 32px;">

      <h3>
        Process Postal Free Entry
      </h3>

      <p class="micro">
        Use this only after a valid postal entry
        has been received and checked.
      </p>

      <form id="postalEntryForm">

        <label class="field">
          Competition ID

          <input
            name="competition_id"
            type="number"
            min="1"
            required
          >
        </label>

        <label class="field">
          Customer account email

          <input
            name="customer_email"
            type="email"
            required
          >
        </label>

        <button
          class="btn gold"
          type="submit"
        >
          PROCESS POSTAL ENTRY
        </button>

      </form>

      <p
        class="micro"
        id="postalEntryResult"
        style="margin-top: 12px;"
      ></p>

    </div>


    <!-- PRIVATE WINNER CONTACT DETAILS -->

    <div style="margin-top: 32px;">

      <h3>
        Winner Contact Details
      </h3>

      <p class="micro">
        Private administrator information.
        Winner email addresses are not shown
        on the public website.
      </p>

      <div class="admin-list">

        ${
          adminWinners.length
            ? adminWinners.map(
                winner => `
                  <div class="admin-row">

                    <div>

                      <strong>
                        🏆
                        ${escapeHtml(
                          winner.winner_name ||
                          'Winner'
                        )}
                      </strong>

                      <p>
                        ${escapeHtml(
                          winner.competition_title ||
                          'Competition'
                        )}
                      </p>


                      <small>
                        Email:
                        <strong>
                          ${escapeHtml(
                            winner.winner_email ||
                            'Unavailable'
                          )}
                        </strong>
                      </small>

                      <br>


                      <small>
                        Ticket:
                        <strong>
                          ${escapeHtml(
                            winner.ticket_number ||
                            ''
                          )}
                        </strong>
                      </small>

                      <br>


                      <small>
                        Drawn:
                        <strong>
                          ${escapeHtml(
                            formatDate(
                              winner.drawn_at
                            )
                          )}
                        </strong>
                      </small>

                                        </div>

                    <div style="margin-top: 12px;">
                      ${
                        winner.winner_email
                          ? `
                            <a
                              class="btn outline"
                              href="${winnerContactLink(
                                winner
                              )}"
                            >
                              CONTACT WINNER
                            </a>
                          `
                          : `
                            <button
                              class="btn outline"
                              disabled
                            >
                              EMAIL UNAVAILABLE
                            </button>
                          `
                      }
                    </div>

                  </div>
                `
              ).join('')
            : `
                <p class="empty">
                  No winners have been drawn yet.
                </p>
              `
        }

      </div>

    </div>
  `;

  /* POSTAL FREE ENTRY */

  const postalEntryForm =
    $('#postalEntryForm');

  if (postalEntryForm) {
    postalEntryForm.onsubmit =
      async event => {
        event.preventDefault();

        const result =
          $('#postalEntryResult');

        const formData =
          new FormData(
            postalEntryForm
          );

        const competitionId =
          Number(
            formData.get(
              'competition_id'
            )
          );

        const customerEmail =
          String(
            formData.get(
              'customer_email'
            ) || ''
          )
            .trim()
            .toLowerCase();

        if (result) {
          result.textContent =
            'Processing postal entry...';
        }

        try {
          const {
            data,
            error
          } =
            await supabaseClient
              .functions
              .invoke(
                'create-postal-entry',
                {
                  body: {
                    competition_id:
                      competitionId,

                    customer_email:
                      customerEmail
                  }
                }
              );

          if (error) {
            throw error;
          }

          if (!data?.success) {
            throw new Error(
              data?.error ||
              'Unable to create postal entry'
            );
          }

          if (result) {
            result.textContent =
              `Entry created. Ticket: ${
                data.ticket
                  ?.ticket_number ||
                'Created'
              }`;
          }

          toast(
            'Postal entry created'
          );

          postalEntryForm.reset();

          await loadCompetitionsFromSupabase();

        } catch (error) {
          console.error(
            'Postal entry error:',
            error
          );

          if (result) {
            result.textContent =
              error instanceof Error
                ? error.message
                : 'Unable to create postal entry';
          }

          toast(
            'Postal entry failed'
          );
        }
      };
  }


  /* ADMIN LOGOUT */
   
  /* ADMIN LOGOUT */

  $('#adminLogout').onclick =
    async () => {
      await supabaseClient.auth
        .signOut();

      closeModals();

      await updateAccountLabel();

      toast(
        'Admin logged out'
      );
    };


  /* SAVE COMPETITION */

  $('#competitionForm').onsubmit =
    saveCompetition;


  /* EDIT BUTTONS */

  $$('[data-edit]').forEach(
    button => {
      button.onclick =
        () =>
          adminView(
            button.dataset.edit
          );
    }
  );


  /* CLOSE COMPETITION BUTTONS */

  $$(
    '[data-close-competition]'
  ).forEach(
    button => {
      button.onclick =
        () =>
          closeCompetition(
            button.dataset
              .closeCompetition
          );
    }
  );


 /* DRAW WINNER BUTTONS */

$$('[data-winner]').forEach(
  button => {
    button.onclick =
      () =>
        drawWinnerSecurely(
          button.dataset.winner
        );
  }
);


/* MARKETING EMAIL */

const marketingButton =
  $('#sendMarketingEmail');

if (marketingButton) {
  marketingButton.onclick =
    async () => {

      const confirmed =
        confirm(
          'Send the Pokémon draw announcement to all customers currently opted in to marketing emails?\n\nThis will send real emails.'
        );

      if (!confirmed) {
        return;
      }

      marketingButton.disabled = true;
      marketingButton.textContent =
        'SENDING...';

      try {
       const {
  data: sessionData,
  error: sessionError,
} =
  await supabaseClient.auth
    .getSession();

if (
  sessionError ||
  !sessionData.session
) {
  alert(
    'Your admin session could not be verified. Please log in again.'
  );

  return;
}

const {
  data,
  error,
} =
  await supabaseClient
    .functions
    .invoke(
      'send-marketing-email',
      {
        body: {},
        headers: {
          Authorization:
            `Bearer ${sessionData.session.access_token}`,
        },
      }
    );

        if (error) {
          console.error(
            'Marketing email error:',
            error
          );

          alert(
            'The marketing email send could not be completed.\n\nCheck the Edge Function logs before trying again.'
          );

          return;
        }

        console.log(
          'Marketing email result:',
          data
        );

        alert(
          `Marketing campaign finished.\n\n` +
          `Eligible: ${data?.eligible ?? 0}\n` +
          `Sent: ${data?.sent ?? 0}\n` +
          `Skipped: ${data?.skipped ?? 0}\n` +
          `Failed: ${data?.failed ?? 0}`
        );

      } catch (error) {
        console.error(
          'Marketing email unexpected error:',
          error
        );

        alert(
          'Something went wrong while sending the marketing campaign.\n\nCheck the Edge Function logs before trying again.'
        );

      } finally {
        marketingButton.disabled = false;
        marketingButton.textContent =
          'SEND MARKETING EMAIL';
      }
    };
}
}


/* =========================================================
   ADMIN IMAGE / SAVE
   ========================================================= */

async function uploadCompetitionImage(
  file
) {
  if (!file || !file.size) {
    return '';
  }

  const extension = (
    file.name
      .split('.')
      .pop() || 'jpg'
  )
    .toLowerCase()
    .replace(
      /[^a-z0-9]/g,
      ''
    ) || 'jpg';

  const path =
    `${ADMIN_UID}/` +
    `${Date.now()}-` +
    `${crypto.randomUUID()}.` +
    `${extension}`;

  const { error } =
    await supabaseClient.storage
      .from(
        'competition-images'
      )
      .upload(
        path,
        file,
        {
          cacheControl: '3600',
          upsert: false
        }
      );

  if (error) throw error;

  const { data } =
    supabaseClient.storage
      .from(
        'competition-images'
      )
      .getPublicUrl(path);

  return data?.publicUrl || '';
}

async function saveCompetition(
  event
) {
  event.preventDefault();

  if (!(await isAdminSession())) {
    alert(
      'Administrator access required.'
    );

    return;
  }

  const formData =
    new FormData(event.target);

  const existingId =
    String(
      formData.get('id') || ''
    ).trim();

  const existing =
    existingId
      ? competitions.find(
          item =>
            item.id ===
            existingId
        )
      : null;

  const title =
    String(
      formData.get('title') || ''
    ).trim();

  const price =
    Number(
      formData.get('price')
    );

  const maxEntries =
    Number(
      formData.get(
        'max_entries'
      )
    );

  const closesInput =
    String(
      formData.get(
        'closes_at'
      ) || ''
    ).trim();

  const description =
    String(
      formData.get(
        'description'
      ) || ''
    ).trim();

  const skillQuestion =
    String(
      formData.get(
        'skill_question'
      ) || ''
    ).trim();

  const optionA =
    String(
      formData.get(
        'skill_option_a'
      ) || ''
    ).trim();

  const optionB =
    String(
      formData.get(
        'skill_option_b'
      ) || ''
    ).trim();

  const optionC =
    String(
      formData.get(
        'skill_option_c'
      ) || ''
    ).trim();

  const correctLetter =
    String(
      formData.get(
        'correct_answer_letter'
      ) || 'A'
    );

  const status =
    String(
      formData.get('status') ||
      'live'
    );

  if (
    !title ||
    !Number.isFinite(price) ||
    price < 0 ||
    !Number.isInteger(
      maxEntries
    ) ||
    maxEntries < 1 ||
    !skillQuestion ||
    !optionA ||
    !optionB ||
    !optionC
  ) {
    alert(
      'Please complete all required competition fields.'
    );

    return;
  }

  let imageUrl =
    existing?.image || '';

  const imageFile =
    formData.get('image');

  if (
    imageFile instanceof File &&
    imageFile.size
  ) {
    try {
      imageUrl =
        await uploadCompetitionImage(
          imageFile
        );
    } catch (error) {
      alert(
        'Image upload failed: ' +
        (
          error?.message ||
          'Unknown error'
        )
      );

      return;
    }
  }

  if (!imageUrl) {
    alert(
      'Please upload a competition image.'
    );

    return;
  }

  const payload = {
    title,
    price,

         image_url: imageUrl,

    closes_at:
      closesInput
        ? new Date(
            closesInput
          ).toISOString()
        : null,

    max_entries: maxEntries,
    status,
    description,
    skill_question:
      skillQuestion,
    skill_option_a:
      optionA,
    skill_option_b:
      optionB,
    skill_option_c:
      optionC
  };

  let competitionId =
    existingId;

  if (existingId) {
    const { error } =
      await supabaseClient
        .from('competitions')
        .update(payload)
        .eq(
          'id',
          existingId
        );

    if (error) {
      alert(
        'Competition save failed: ' +
        error.message
      );

      return;
    }
  } else {
    const { data, error } =
      await supabaseClient
        .from('competitions')
        .insert(payload)
        .select('id')
        .single();

    if (error) {
      alert(
        'Competition save failed: ' +
        error.message
      );

      return;
    }

    competitionId =
      String(data.id);
  }

  const correctAnswer =
    correctLetter === 'B'
      ? optionB
      : correctLetter === 'C'
        ? optionC
        : optionA;

  const {
    data: existingAnswer,
    error: lookupError
  } = await supabaseClient
    .from(
      'competition_skill_answers'
    )
    .select('competition_id')
    .eq(
      'competition_id',
      competitionId
    )
    .maybeSingle();

  if (lookupError) {
    alert(
      'Competition saved, but private answer lookup failed: ' +
      lookupError.message
    );

    return;
  }

  if (existingAnswer) {
    const { error } =
      await supabaseClient
        .from(
          'competition_skill_answers'
        )
        .update({
          correct_answer:
            correctAnswer
        })
        .eq(
          'competition_id',
          competitionId
        );

    if (error) {
      alert(
        'Competition saved, but private answer update failed: ' +
        error.message
      );

      return;
    }
  } else {
    const { error } =
      await supabaseClient
        .from(
          'competition_skill_answers'
        )
        .insert({
          competition_id:
            competitionId,

          correct_answer:
            correctAnswer
        });

    if (error) {
      alert(
        'Competition saved, but private answer save failed: ' +
        error.message
      );

      return;
    }
  }

  await loadCompetitionsFromSupabase();

  await adminView();

  toast(
    existingId
      ? 'Competition updated'
      : isFreeCompetition({
          price
        })
        ? 'Free competition added'
        : 'Competition added'
  );
}


/* =========================================================
   CLOSE COMPETITION
   ========================================================= */

async function closeCompetition(id) {
  if (!(await isAdminSession())) {
    alert(
      'Administrator access required.'
    );

    return;
  }

  const competition =
    competitions.find(
      item =>
        item.id === String(id)
    );

  if (!competition) return;

  if (
    competition.status ===
    'closed'
  ) {
    toast(
      'Competition is already closed'
    );

    return;
  }

  const confirmed =
    window.confirm(
      `Close "${competition.title}"?\n\n` +
      'This will remove the competition from the main website.\n\n' +
      'The competition record, image, entries, orders, tickets and other saved data will NOT be deleted.'
    );

  if (!confirmed) return;

  const { error } =
    await supabaseClient
      .from('competitions')
      .update({
        status: 'closed'
      })
      .eq('id', id);

  if (error) {
    console.error(
      'Close competition error:',
      error
    );

    alert(
      'Could not close competition: ' +
      error.message
    );

    return;
  }

  cart =
    store
      .get('nexa_cart', [])
      .filter(
        item =>
          item.id !== String(id)
      );

  store.set(
    'nexa_cart',
    cart
  );

  updateCartCount();

  await loadCompetitionsFromSupabase();

  await adminView();

  toast(
    'Competition closed'
  );
}


/* =========================================================
   DELETE COMPETITION
   ========================================================= */

/*
  NO DELETE BUTTON IS SHOWN IN ADMIN.

  This function remains available
  internally only.

  Normal admin use should close
  competitions instead.
*/

async function deleteCompetition(id) {
  if (!(await isAdminSession())) {
    alert(
      'Administrator access required.'
    );

    return;
  }

  const competition =
    competitions.find(
      item =>
        item.id === String(id)
    );

  if (!competition) return;

  if (
    !confirm(
      `Delete "${competition.title}"?`
    )
  ) {
    return;
  }

  const { error: answerError } =
    await supabaseClient
      .from(
        'competition_skill_answers'
      )
      .delete()
      .eq(
        'competition_id',
        id
      );

  if (answerError) {
    alert(
      'Delete failed: ' +
      answerError.message
    );

    return;
  }

  const { error } =
    await supabaseClient
      .from('competitions')
      .delete()
      .eq('id', id);

  if (error) {
    alert(
      'Delete failed: ' +
      error.message
    );

    return;
  }

  cart =
    store
      .get('nexa_cart', [])
      .filter(
        item =>
          item.id !== String(id)
      );

  store.set(
    'nexa_cart',
    cart
  );

  updateCartCount();

  await loadCompetitionsFromSupabase();

  await adminView();

  toast(
    'Competition deleted'
  );
}


/* =========================================================
   LEGAL PLACEHOLDERS
   ========================================================= */

const legalPages = {

  terms: `
    <p class="eyebrow">
      LEGAL
    </p>

    <h2>
      Terms &amp; Conditions
    </h2>

    <p>
      <strong>Last updated: 15 September 2026</strong>
    </p>

    <p>
      These Terms and Conditions apply to competitions operated through
      nexadraw.co.uk by Nexa Draw Limited, trading as Nexa Draw.
      By entering a competition, you agree to these Terms and Conditions
      together with any specific terms displayed on the relevant
      competition page.
    </p>

    <h3>1. Promoter</h3>

    <p>
      The promoter is <strong>Nexa Draw Limited</strong>,
      trading as <strong>Nexa Draw</strong>.
    </p>

    <p>
      Company number:
      <strong>17442068</strong>
    </p>

    <p>
      Registered office:
      <strong>7 High Street, Kington, HR5 3AX, United Kingdom</strong>
    </p>

    <p>
      Email:
      <strong>reciepts@nexadraw.co.uk</strong>
    </p>

    <h3>2. Eligibility</h3>

    <p>
      Competitions are open to individuals aged 18 or over who are legally
      resident in the United Kingdom, unless a particular competition
      expressly states otherwise.
    </p>

    <p>
      Employees, directors, contractors and immediate family members of
      Nexa Draw, and anyone professionally connected with the administration
      of a competition, may not enter.
    </p>

    <p>
      Nexa Draw may require reasonable proof of age, identity and address
      before accepting an entry or awarding a prize.
    </p>

    <h3>3. How to Enter</h3>

    <p>
      Each competition will display its entry price, closing date,
      maximum number of entries, prize details and any applicable
      entry limits.
    </p>

    <p>To enter online, entrants must:</p>

    <ul>
      <li>Create or log in to a Nexa Draw account.</li>
      <li>Select the relevant competition.</li>
      <li>Select the required number of entries.</li>
      <li>Answer any competition question presented.</li>
      <li>Complete the entry process.</li>
      <li>Where applicable, successfully complete payment.</li>
    </ul>

    <p>
      An entry is not valid until it has been accepted by Nexa Draw and
      a valid competition ticket or entry number has been issued.
    </p>

    <p>
      Entrants are responsible for ensuring that the information supplied
      on their account is accurate and up to date.
    </p>

    <h3>4. Free Entry Route</h3>

    <p>
      Where a competition offers a free entry route, full instructions
      for using that route will be displayed on the relevant competition
      page or on the Nexa Draw Free Entry Route page.
    </p>

    <p>
      Valid free entries will be treated in the same manner as valid paid
      entries when a winner is selected.
    </p>

    <p>
      Entrants using a free entry route must follow all stated instructions
      and ensure their entry is received before the applicable closing
      deadline.
    </p>

    <p>
      Free entries that are incomplete, illegible, received late or do
      not comply with the stated requirements may be rejected.
    </p>

    <h3>5. Competition Questions</h3>

    <p>
      A competition may require an entrant to answer a question before an
      entry can be accepted.
    </p>

    <p>
      Where the rules of a competition require a correct answer, an
      incorrect answer may result in the entry being rejected.
    </p>

    <h3>6. Entry Limits</h3>

    <p>
      Competitions may have a maximum number of entries overall and may
      also have a maximum number of entries permitted per person.
    </p>

    <p>
      Nexa Draw may reject or cancel entries where it reasonably believes
      that an entrant has attempted to bypass an entry limit through
      multiple accounts, false identities, automated systems or another
      unfair method.
    </p>

    <h3>7. Competition Closing Dates</h3>

    <p>
      The closing date for each competition will be displayed on the
      relevant competition page.
    </p>

    <p>
      Entries received after the applicable closing date will not normally
      be included.
    </p>

    <p>
      Nexa Draw will only amend a closing date or other material competition
      condition where reasonably necessary and permitted by applicable law.
    </p>

    <h3>8. Payment</h3>

    <p>
      Where payment is required, payment must be successfully completed
      using one of the payment methods made available by Nexa Draw.
    </p>

    <p>
      An entry may be cancelled if payment is declined, reversed,
      charged back or otherwise not successfully received.
    </p>

    <p>
      Entry prices are displayed in pounds sterling.
    </p>

    <h3>9. Selection of Winners</h3>

    <p>
      Once a competition has closed, a winner will be selected fairly from
      all valid eligible entries included in that competition.
    </p>

    <p>
      Valid paid entries and valid free entries will be included on an
      equal basis.
    </p>

    <p>
      Nexa Draw will maintain appropriate records of competition results
      and winning entries.
    </p>

    <h3>10. Winner Notification</h3>

    <p>
      Winners will be contacted using the contact information associated
      with their Nexa Draw account.
    </p>

    <p>
      Entrants are responsible for keeping their contact details accurate
      and up to date.
    </p>

    <p>
      Before a prize is released, Nexa Draw may require reasonable proof
      of identity, age, address and eligibility.
    </p>

    <p>
      If a winner cannot be contacted after reasonable attempts, fails
      to provide requested verification, is found to be ineligible or
      refuses the prize, Nexa Draw may select an alternative winner where
      permitted.
    </p>

    <h3>11. Publication of Winners</h3>

    <p>
      Nexa Draw may publish reasonable winner information, including the
      winner's name, competition won, winning ticket number and draw date.
    </p>

    <p>
      Nexa Draw will not publicly display a winner's email address,
      telephone number, home address or other unnecessary personal
      information.
    </p>

    <h3>12. Prizes</h3>

    <p>
      The exact prize offered in each competition will be described on the
      relevant competition page.
    </p>

    <p>
      Nexa Draw may offer prizes including cash, technology products,
      gaming products, Pokémon products, trading cards, graded cards,
      sealed collectible products, other collectibles and consumer goods.
    </p>

    <p>
      Images used on the website may be illustrative unless expressly
      stated otherwise.
    </p>

    <p>
      Where brand, model, edition, specification, condition, grading,
      authenticity, packaging or another characteristic is material to
      the prize, relevant information will be stated on the competition
      page where available.
    </p>

    <p>
      A winner may not demand a cash alternative for a physical prize
      unless a cash alternative is expressly offered for that competition.
    </p>

    <p>
      Where a cash alternative is offered, the amount displayed on the
      relevant competition page will apply.
    </p>

    <h3>13. Cash Prizes</h3>

    <p>
      Where the advertised prize is cash, the amount of the cash prize
      will be clearly stated on the relevant competition page.
    </p>

    <p>
      Cash prizes will be paid to the verified winner using a reasonable
      payment method selected by Nexa Draw.
    </p>

    <p>
      Nexa Draw may require the winner to provide identity verification
      and appropriate payment details before a cash prize is released.
    </p>

    <p>
      Nexa Draw will not knowingly send a cash prize to an account or
      payment method belonging to another person unless reasonably
      satisfied that it is appropriate and lawful to do so.
    </p>

    <h3>14. Technology and Gaming Prizes</h3>

    <p>
      Technology and gaming prizes may include items such as smartphones,
      tablets, laptops, televisions, games consoles, gaming equipment,
      accessories and other electronic products.
    </p>

    <p>
      The relevant competition page will identify the material details of
      the prize, such as brand, model, storage capacity, specification or
      condition where applicable.
    </p>

    <p>
      Unless otherwise stated, technology prizes will be supplied in the
      condition described on the competition page.
    </p>

    <p>
      Any manufacturer warranty or retailer warranty will be subject to
      the terms of the relevant manufacturer or retailer and is not
      provided separately by Nexa Draw unless expressly stated.
    </p>

    <h3>15. Pokémon and Collectible Prizes</h3>

    <p>
      Pokémon and other collectible prizes may include individual cards,
      graded cards, sealed products, booster boxes, collections,
      merchandise or other collectible items.
    </p>

    <p>
      Where relevant, the competition page will describe material details
      such as the item name, set, edition, language, condition, grading
      company, grade, certification details or whether the product is sealed.
    </p>

    <p>
      Where a collectible has been professionally graded, any stated grade
      will be the grade issued by the grading company identified in the
      competition description.
    </p>

    <p>
      Nexa Draw does not guarantee that a collectible will increase or
      maintain its market value after the winner receives it.
    </p>

    <p>
      Market values of trading cards and collectibles can change over time.
      Any approximate value stated in connection with a competition is not
      a guarantee of future resale value.
    </p>

    <h3>16. Prize Delivery or Collection</h3>

    <p>
      Delivery or collection arrangements will be agreed with the winner
      following successful verification.
    </p>

    <p>
      Any material delivery restrictions or costs payable by the winner
      will be stated on the relevant competition page where applicable.
    </p>

    <p>
      Nexa Draw may require a signature or other confirmation of receipt
      for valuable prizes.
    </p>

    <p>
      Winners are responsible for providing accurate delivery information.
    </p>

    <h3>17. Refunds and Cancellations</h3>

    <p>
      Competition entries are generally final once successfully submitted,
      except where a refund is required by law or Nexa Draw chooses to
      provide one.
    </p>

    <p>
      Nexa Draw may cancel, suspend or postpone a competition where
      circumstances outside its reasonable control make this necessary.
    </p>

    <p>
      If a competition is cancelled without a winner being selected,
      Nexa Draw will communicate what will happen to affected entries and
      provide refunds where required by law.
    </p>

    <h3>18. Disqualification</h3>

    <p>
      Nexa Draw may reject or disqualify an entrant where it reasonably
      believes that the entrant:
    </p>

    <ul>
      <li>Has breached these Terms and Conditions.</li>
      <li>Has provided false or misleading information.</li>
      <li>Is not eligible to enter.</li>
      <li>Has attempted to manipulate a competition.</li>
      <li>Has used bots, scripts or automated entry methods.</li>
      <li>Has created multiple accounts to bypass restrictions.</li>
      <li>Has interfered with the website or entry system.</li>
      <li>Has engaged in fraudulent or abusive behaviour.</li>
    </ul>

    <h3>19. Website Availability</h3>

    <p>
      Nexa Draw will take reasonable steps to keep its website and
      competition systems available and secure.
    </p>

    <p>
      Nexa Draw cannot guarantee uninterrupted availability and is not
      responsible for failures caused by an entrant's device, internet
      connection or other circumstances outside Nexa Draw's reasonable
      control.
    </p>

    <h3>20. Limitation of Liability</h3>

    <p>
      Nothing in these Terms excludes or limits liability where it would
      be unlawful to do so, including liability for death or personal
      injury caused by negligence, fraud or fraudulent misrepresentation.
    </p>

    <p>
      Subject to the above, Nexa Draw will not be responsible for losses
      that were not reasonably foreseeable when an entrant entered a
      competition.
    </p>

    <p>
      Nothing in these Terms affects an entrant's statutory rights as a
      consumer.
    </p>

    <h3>21. Personal Information</h3>

    <p>
      Nexa Draw will process personal information in accordance with its
      Privacy Policy and applicable UK data protection law.
    </p>

    <p>
      Personal information may be used to administer competitions,
      process entries and payments, verify winners, deliver prizes,
      prevent fraud and comply with legal obligations.
    </p>

    <p>
      Marketing communications will only be sent where Nexa Draw has an
      appropriate lawful basis to do so, and recipients may unsubscribe
      from marketing communications.
    </p>

    <h3>22. Responsible Participation</h3>

    <p>
      Entrants should participate responsibly and should never spend more
      than they can comfortably afford.
    </p>

    <p>
      Nexa Draw may implement entry limits or other responsible
      participation measures where appropriate.
    </p>

    <h3>23. Changes to These Terms</h3>

    <p>
      Nexa Draw may update these general Terms and Conditions from time
      to time.
    </p>

    <p>
      The terms applying to an entry will normally be those in force at
      the time the entry was made, except where a change is required by
      law or is necessary to correct an obvious error without unfairly
      disadvantaging entrants.
    </p>

    <h3>24. Governing Law</h3>

    <p>
      These Terms and Conditions are governed by the laws of England and
      Wales.
    </p>

    <p>
      Entrants living elsewhere in the United Kingdom will retain any
      mandatory consumer protections that apply where they live.
    </p>

    <p>
      Nothing in these Terms affects your statutory rights as a consumer.
    </p>

    <h3>25. Complaints</h3>

    <p>
      If you have a complaint concerning a competition or Nexa Draw,
      please contact:
    </p>

    <p>
      <strong>reciepts@nexadraw.co.uk</strong>
    </p>

    <p>
      Or write to:
    </p>

    <p>
      <strong>
        Nexa Draw Limited<br>
        7 High Street<br>
        Kington<br>
        HR5 3AX<br>
        United Kingdom
      </strong>
    </p>

    <p>
      Please include your name, account email, the competition concerned
      and enough information for us to investigate the matter.
    </p>

    <h3>26. Contact</h3>

    <p>
      Questions about these Terms and Conditions can be sent to:
    </p>

    <p>
      <strong>reciepts@nexadraw.co.uk</strong>
    </p>

    <p>
      Postal correspondence can be sent to:
    </p>

    <p>
      <strong>
        Nexa Draw Limited<br>
        7 High Street<br>
        Kington<br>
        HR5 3AX<br>
        United Kingdom
      </strong>
    </p>
  `,


  privacy: `
    <p class="eyebrow">
      LEGAL
    </p>

    <h2>
      Privacy Policy
    </h2>

    <p>
      <strong>Last updated: 15 September 2026</strong>
    </p>

    <p>
      This Privacy Policy explains how Nexa Draw collects, uses and protects
      personal information when you use nexadraw.co.uk, create an account,
      enter competitions or contact us.
    </p>

    <h3>1. Who We Are</h3>

    <p>
      Nexa Draw is the trading name of
      <strong>Nexa Draw Limited</strong>.
    </p>

    <p>
      Company number:
      <strong>17442068</strong>
    </p>

    <p>
      Registered office:
      <strong>7 High Street, Kington, HR5 3AX, United Kingdom</strong>
    </p>

    <p>
      Nexa Draw Limited is responsible for the personal information
      collected through nexadraw.co.uk.
    </p>

    <p>
      Contact:
      <strong>reciepts@nexadraw.co.uk</strong>
    </p>

    <h3>2. Information We May Collect</h3>

    <p>We may collect information including:</p>

    <ul>
      <li>Your name.</li>
      <li>Your email address.</li>
      <li>Your account details.</li>
      <li>Your competition entries and ticket numbers.</li>
      <li>Your order and payment status.</li>
      <li>Your winner and prize information.</li>
      <li>Messages or enquiries you send to us.</li>
      <li>Technical information relating to your use of the website.</li>
    </ul>

    <h3>3. Account Information</h3>

    <p>
      When you create a Nexa Draw account, we use your information to create
      and manage your account, authenticate you and provide access to your
      competition entries and account features.
    </p>

    <h3>4. Competition Entries</h3>

    <p>
      We process information relating to your competition entries so that we
      can administer competitions, issue ticket numbers, determine valid
      entries, select winners and maintain competition records.
    </p>

    <h3>5. Payments</h3>

    <p>
      Where paid competitions are available, payments may be processed by
      third-party payment service providers.
    </p>

    <p>
      Nexa Draw does not need to store your full payment card details where
      those details are handled securely by the payment provider.
    </p>

    <p>
      We may receive limited payment information such as payment status,
      transaction references and amounts paid.
    </p>

    <h3>6. Emails and Communications</h3>

    <p>
      We may use your email address to send important service communications
      such as account verification, entry confirmations, winner notifications
      and information relating to competitions you have entered.
    </p>

    <p>
      Email communications may be delivered using third-party email service
      providers.
    </p>

    <h3>7. Marketing</h3>

    <p>
      We will only send marketing communications where we have an appropriate
      lawful basis to do so.
    </p>

    <p>
      You can unsubscribe from marketing communications at any time using
      the unsubscribe option provided or by contacting us.
    </p>

    <p>
      Service messages that are necessary to operate your account or
      competition entries may still be sent.
    </p>

    <h3>8. How We Use Personal Information</h3>

    <p>We may use personal information to:</p>

    <ul>
      <li>Create and manage user accounts.</li>
      <li>Administer competitions and entries.</li>
      <li>Process and record orders and payments.</li>
      <li>Issue and manage competition tickets.</li>
      <li>Select, verify and contact winners.</li>
      <li>Arrange prize delivery or payment.</li>
      <li>Respond to enquiries and complaints.</li>
      <li>Detect and prevent fraud or misuse.</li>
      <li>Maintain the security of our website and systems.</li>
      <li>Meet legal, regulatory and accounting obligations.</li>
      <li>Improve our website and services.</li>
    </ul>

    <h3>9. Our Lawful Bases</h3>

    <p>
      Depending on the circumstances, we may process personal information
      because:
    </p>

    <ul>
      <li>It is necessary to perform a contract with you.</li>
      <li>It is necessary to comply with a legal obligation.</li>
      <li>We have a legitimate interest in operating and protecting Nexa Draw.</li>
      <li>You have provided consent where consent is required.</li>
    </ul>

    <h3>10. Service Providers</h3>

    <p>
      We may use trusted third-party service providers to help operate
      Nexa Draw, including providers of website hosting, databases,
      authentication, email delivery and payment processing.
    </p>

    <p>
      These providers may process personal information only as necessary
      to provide their services and subject to applicable data protection
      requirements.
    </p>

    <h3>11. Supabase</h3>

    <p>
      Nexa Draw uses Supabase for services including database storage,
      authentication and backend functionality.
    </p>

    <p>
      Information relating to your account and competition activity may
      therefore be processed through Supabase systems.
    </p>

    <h3>12. Email Delivery</h3>

    <p>
      Nexa Draw may use third-party email providers, including Resend,
      to deliver account and competition-related emails.
    </p>

    <p>
      Information such as your email address and the content necessary
      to send the relevant message may be processed by the email provider.
    </p>

    <h3>13. Payment Providers</h3>

    <p>
      Where Nexa Draw offers paid entries, payment information may be
      processed by the payment provider selected by Nexa Draw.
    </p>

    <p>
      The payment provider will process information in accordance with
      its own privacy and security requirements.
    </p>

    <h3>14. Sharing Personal Information</h3>

    <p>
      We do not sell your personal information.
    </p>

    <p>We may share information where necessary with:</p>

    <ul>
      <li>Service providers acting on our behalf.</li>
      <li>Payment processors.</li>
      <li>Email service providers.</li>
      <li>Professional advisers where necessary.</li>
      <li>Law enforcement, regulators or public authorities where required.</li>
    </ul>

    <h3>15. Winner Information</h3>

    <p>
      We may publish limited information about competition winners where
      appropriate, including a winner's name, the competition won,
      winning ticket number and draw date.
    </p>

    <p>
      We will not publicly publish a winner's email address, telephone
      number or home address.
    </p>

    <h3>16. Data Security</h3>

    <p>
      Nexa Draw takes reasonable technical and organisational measures
      to protect personal information against unauthorised access,
      loss, misuse or disclosure.
    </p>

    <p>
      No internet-based service can guarantee complete security, but
      we take reasonable steps to protect the information we process.
    </p>

    <h3>17. How Long We Keep Information</h3>

    <p>
      We keep personal information only for as long as reasonably necessary
      for the purposes for which it was collected and to meet legal,
      accounting, fraud-prevention and dispute-resolution requirements.
    </p>

    <p>
      Different categories of information may be retained for different
      periods.
    </p>

    <h3>18. Your Data Protection Rights</h3>

    <p>
      Depending on the circumstances, you may have rights including the
      right to:
    </p>

    <ul>
      <li>Request access to your personal information.</li>
      <li>Request correction of inaccurate information.</li>
      <li>Request deletion of personal information.</li>
      <li>Request restriction of processing.</li>
      <li>Object to certain processing.</li>
      <li>Request transfer of your information where applicable.</li>
      <li>Withdraw consent where processing is based on consent.</li>
    </ul>

    <p>
      These rights are subject to applicable legal conditions and exemptions.
    </p>

    <h3>19. Exercising Your Rights</h3>

    <p>
      To make a privacy request, contact:
    </p>

    <p>
      <strong>reciepts@nexadraw.co.uk</strong>
    </p>

    <p>
      We may need to verify your identity before responding to a request.
    </p>

    <h3>20. Cookies and Similar Technologies</h3>

    <p>
      Nexa Draw may use cookies, local storage and similar technologies
      where necessary to provide website functionality, maintain sessions
      and improve the user experience.
    </p>

    <p>
      Additional cookie information may be provided separately where required.
    </p>

    <h3>21. International Processing</h3>

    <p>
      Some service providers may process information outside the United
      Kingdom.
    </p>

    <p>
      Where required, appropriate safeguards will be used for international
      transfers of personal information.
    </p>

    <h3>22. Children</h3>

    <p>
      Nexa Draw competitions are intended for adults aged 18 or over.
    </p>

    <p>
      We do not knowingly allow anyone under 18 to enter competitions.
    </p>

    <h3>23. Changes to This Privacy Policy</h3>

    <p>
      We may update this Privacy Policy from time to time to reflect
      changes to our services, technology or legal requirements.
    </p>

    <p>
      The latest version will be made available on nexadraw.co.uk.
    </p>

    <h3>24. Complaints</h3>

    <p>
      If you have concerns about how Nexa Draw handles your personal
      information, please contact us first so that we can investigate.
    </p>

    <p>
      You also have the right to raise a complaint with the UK Information
      Commissioner's Office where applicable.
    </p>

    <h3>25. Contact</h3>

    <p>
      For privacy questions or requests, contact:
    </p>

    <p>
      <strong>reciepts@nexadraw.co.uk</strong>
    </p>

    <p>
      Postal correspondence can be sent to:
    </p>

    <p>
      <strong>
        Nexa Draw Limited<br>
        7 High Street<br>
        Kington<br>
        HR5 3AX<br>
        United Kingdom
      </strong>
    </p>
  `,


  free: `
    <p class="eyebrow">
      LEGAL
    </p>

    <h2>
      Free Entry Route
    </h2>

    <p>
      <strong>Last updated: 15 September 2026</strong>
    </p>

    <p>
      Nexa Draw provides a postal free entry route for eligible paid
      competitions. A valid free postal entry has the same chance of
      winning as a valid paid entry.
    </p>

    <h3>1. Who Can Enter</h3>

    <p>
      Free postal entry is available to eligible entrants aged 18 or over
      who are legally resident in the United Kingdom, subject to the
      specific rules of the relevant competition.
    </p>

    <p>
      You must have a valid Nexa Draw account before submitting a free
      postal entry.
    </p>

    <h3>2. How to Enter for Free</h3>

    <p>
      To enter an eligible competition without paying the online entry
      price, send your entry by ordinary first-class or second-class post to:
    </p>

    <p>
      <strong>
        Nexa Draw Limited<br>
        7 High Street<br>
        Kington<br>
        Herefordshire<br>
        HR5 3AX<br>
        United Kingdom
      </strong>
    </p>

    <p>Your postal entry must clearly include:</p>

    <ul>
      <li>Your full name.</li>
      <li>Your date of birth.</li>
      <li>Your full postal address.</li>
      <li>The email address registered to your Nexa Draw account.</li>
      <li>The exact name of the competition you wish to enter.</li>
      <li>Your answer to the competition question.</li>
    </ul>

    <p>
      Please write clearly. Nexa Draw must be able to identify you,
      your account and the competition you wish to enter.
    </p>

    <h3>3. One Free Entry Per Person</h3>

    <p>
      Each eligible person may submit a maximum of
      <strong>one free postal entry per competition</strong>.
    </p>

    <p>
      Multiple free entries submitted by the same person for the same
      competition may be rejected.
    </p>

    <h3>4. Postal Requirements</h3>

    <p>
      Free entries must be sent using ordinary first-class or second-class
      post.
    </p>

    <p>
      There is no requirement to use Special Delivery, Signed For or any
      other premium postal service.
    </p>

    <p>
      The entrant is responsible for the ordinary cost of postage.
    </p>

    <h3>5. Closing Deadline</h3>

    <p>
      Postal entries must be received by Nexa Draw before the closing
      deadline stated for the relevant competition.
    </p>

    <p>
      Posting an entry before the closing date does not guarantee that it
      will arrive before the deadline. Entrants should allow sufficient
      time for delivery.
    </p>

    <p>
      Entries received after the competition has closed will not be included.
    </p>

    <h3>6. Competition Question</h3>

    <p>
      Where a competition requires a competition question to be answered,
      the postal entrant must provide their answer as part of the free entry.
    </p>

    <p>
      Where the competition rules require a correct answer, an incorrect
      answer may result in the entry being rejected.
    </p>

    <h3>7. Processing Your Free Entry</h3>

    <p>
      Once a valid postal entry has been received and verified, Nexa Draw
      will allocate an entry or ticket number to that entrant for the
      relevant competition.
    </p>

    <p>
      The entry will then be included in the competition in the same way
      as a valid paid entry.
    </p>

    <p>
      Nexa Draw may contact the entrant using the email address registered
      to their account if further information is reasonably required to
      process the entry.
    </p>

    <h3>8. Equal Treatment</h3>

    <p>
      Valid free entries and valid paid entries are treated equally when
      a winner is selected.
    </p>

    <p>
      Paying for an entry does not give an entrant preferential treatment
      over someone who has submitted a valid free postal entry.
    </p>

    <h3>9. Invalid Entries</h3>

    <p>A free entry may be rejected if:</p>

    <ul>
      <li>It is received after the competition closing deadline.</li>
      <li>Required information is missing or illegible.</li>
      <li>The entrant cannot be matched to a valid Nexa Draw account.</li>
      <li>The entrant is under 18 or otherwise ineligible.</li>
      <li>The wrong competition is identified.</li>
      <li>A required competition answer is missing or invalid.</li>
      <li>The entrant has already used their free entry for that competition.</li>
      <li>The entry does not comply with these instructions.</li>
    </ul>

    <h3>10. Proof of Posting</h3>

    <p>
      Proof of posting is not proof that an entry was received by Nexa Draw.
    </p>

    <p>
      Nexa Draw cannot be responsible for postal entries that are lost,
      delayed, damaged or incorrectly addressed before they are received.
    </p>

    <h3>11. Winner Selection</h3>

    <p>
      A valid free postal entry will be included in the same winner
      selection process as every other valid entry in the competition.
    </p>

    <h3>12. Contact</h3>

    <p>
      Questions about the Nexa Draw Free Entry Route can be sent to:
    </p>

    <p>
      <strong>reciepts@nexadraw.co.uk</strong>
    </p>
  `,


  responsible: `
    <p class="eyebrow">
      CUSTOMER CARE
    </p>

    <h2>
      Responsible Play
    </h2>

    <p>
      <strong>Last updated: 15 September 2026</strong>
    </p>

    <p>
      Nexa Draw competitions are intended to be an enjoyable form of
      entertainment. We encourage all customers to participate responsibly.
    </p>

    <h3>1. Age Requirement</h3>

    <p>
      Nexa Draw competitions are intended only for people aged 18 or over.
    </p>

    <p>
      We may request proof of age or identity before allowing participation
      or releasing a prize.
    </p>

    <h3>2. Spend Responsibly</h3>

    <p>
      Never spend more on competition entries than you can comfortably afford.
    </p>

    <p>
      Competition entries should never be treated as a way to make money
      or solve financial difficulties.
    </p>

    <h3>3. Set Personal Limits</h3>

    <p>
      Consider setting yourself a personal budget before entering
      competitions and do not exceed it.
    </p>

    <p>
      Take regular breaks and avoid entering competitions when upset,
      under financial pressure or otherwise unable to make considered
      decisions.
    </p>

    <h3>4. Entry Limits</h3>

    <p>
      Nexa Draw may apply entry limits to individual competitions and may
      introduce additional customer protection measures where appropriate.
    </p>

    <h3>5. Account Concerns</h3>

    <p>
      If you are concerned about your participation or would like help
      regarding your Nexa Draw account, contact us and we will consider
      what reasonable account controls are available.
    </p>

    <h3>6. Protecting Your Account</h3>

    <p>
      Keep your account login details secure and do not allow anyone under
      18 to use your Nexa Draw account.
    </p>

    <p>
      Contact us promptly if you believe someone else has accessed your
      account without permission.
    </p>

    <h3>7. Free Entry</h3>

    <p>
      Where a competition offers a free entry route, details will be
      available on the relevant competition page and through the Nexa Draw
      Free Entry Route information.
    </p>

    <h3>8. Getting Support</h3>

    <p>
      If competition participation is causing you financial stress or
      affecting your wellbeing, consider stopping participation and seeking
      independent support.
    </p>

    <h3>9. Contact</h3>

    <p>
      For responsible participation or account-related enquiries, contact:
    </p>

    <p>
      <strong>reciepts@nexadraw.co.uk</strong>
    </p>
  `

};

function openLegalPage(key) {
  const host =
    $('#legalContent');

  if (!host) return;

  host.innerHTML =
    legalPages[key] ||
    '<p>Page unavailable.</p>';

  openModal('#legalModal');
}

/* =========================================================
   PAGE EVENTS
   ========================================================= */

document.addEventListener(
  'click',
  event => {
    if (
      event.target.matches(
        '[data-close]'
      )
    ) {
      closeModals();
    }

    if (
      event.target.classList
        ?.contains('modal')
    ) {
      closeModals();
    }

    const legal =
      event.target.closest(
        '[data-legal]'
      );

    if (legal) {
      openLegalPage(
        legal.dataset.legal
      );
    }

    const navItem =
      event.target.closest(
        '#nav a, #nav button'
      );

    if (navItem) {
      $('#nav')
        ?.classList
        .remove('open');
    }
  }
);

$('#cartBtn')
  ?.addEventListener(
    'click',
    openCart
  );

$('#accountBtn')
  ?.addEventListener(
    'click',
    async () => {
      await renderAccount(false);

      openModal(
        '#accountModal'
      );
    }
  );

$('#checkoutBtn')
  ?.addEventListener(
    'click',
    checkout
  );

$('#viewAllBtn')
  ?.addEventListener(
    'click',
    () => {
      document
        .querySelector('#draws')
        ?.scrollIntoView({
          behavior: 'smooth'
        });
    }
  );


/* =========================================================
   AUTH CHANGES
   ========================================================= */

supabaseClient.auth.onAuthStateChange(
  async () => {
    await updateAccountLabel();
  }
);


/* =========================================================
   FUNCTIONS USED BY HTML BUTTONS
   ========================================================= */

window.openCart =
  openCart;

window.renderAccount =
  renderAccount;

window.openModal =
  openModal;

window.openSecureAdmin =
  openSecureAdmin;

window.enterFreeCompetition =
  enterFreeCompetition;

function initAgeGate() {
  const ageGate =
    document.getElementById('ageGate');

  const yesButton =
    document.getElementById('ageConfirmYes');

  const noButton =
    document.getElementById('ageConfirmNo');

  if (
    !ageGate ||
    !yesButton ||
    !noButton
  ) {
    return;
  }

  const confirmed =
    localStorage.getItem(
      'nexa_age_confirmed'
    );

  if (confirmed === 'yes') {
    return;
  }

  ageGate.classList.add('open');

  ageGate.setAttribute(
    'aria-hidden',
    'false'
  );

  document.body.classList.add(
    'age-locked'
  );

  yesButton.onclick = () => {
    localStorage.setItem(
      'nexa_age_confirmed',
      'yes'
    );

    ageGate.classList.remove('open');

    ageGate.setAttribute(
      'aria-hidden',
      'true'
    );

    document.body.classList.remove(
      'age-locked'
    );
  };

  noButton.onclick = () => {
    document.body.innerHTML = `
      <main
        style="
          min-height:100vh;
          display:flex;
          align-items:center;
          justify-content:center;
          padding:24px;
          background:#080808;
          color:#fff;
          text-align:center;
        "
      >
        <div>
          <h1>Nexa Draw</h1>

          <p>
            You must be 18 or over to use this website.
          </p>
        </div>
      </main>
    `;
  };
}

document.addEventListener(
  'DOMContentLoaded',
  initAgeGate
);

document.addEventListener(
  'DOMContentLoaded',
  handleNochexReturn
);

async function handleNochexReturn() {
  const params =
    new URLSearchParams(
      window.location.search
    );

  const isPaymentReturn =
    params.get('payment') ===
    'return';

  if (!isPaymentReturn) {
    return;
  }

  const resourcePath =
    params.get('resourcePath');

  /*
    Remove the payment-return parameters from
    the address bar so refreshing the page does
    not attempt verification again.
  */
  const clearPaymentReturnUrl = () => {
    window.history.replaceState(
      {},
      document.title,
      window.location.pathname
    );
  };

  if (!resourcePath) {
    console.warn(
      'Nochex return received without resourcePath'
    );

    clearPaymentReturnUrl();

    alert(
      'Payment received — we are confirming your entry.\n\n' +
      'Please do not make another payment. ' +
      'Your entry will appear in My Account once confirmation is complete.'
    );

    return;
  }

  try {
    console.log(
      'Nochex payment return received'
    );

    const {
      data,
      error
    } =
      await supabaseClient.functions.invoke(
        'verify-nochex-payment',
        {
          body: {
            resourcePath
          }
        }
      );

    if (error) {
      console.error(
        'Nochex verification error:',
        error
      );

      clearPaymentReturnUrl();

      alert(
        'Payment received — we are confirming your entry.\n\n' +
        'Please do not make another payment. ' +
        'Your entry will appear in My Account once confirmation is complete.'
      );

      return;
    }

    console.log(
      'Nochex verification response:',
      data
    );

    if (
      data?.verified &&
      data?.state === 'success'
    ) {
      /*
        Payment has been securely verified
        and the order has been finalized.
      */
      store.set('nexa_cart', []);
      cart = [];
      updateCartCount();

      clearPaymentReturnUrl();

      await loadCompetitionsFromSupabase();

      alert(
        'Payment confirmed!\n\n' +
        'Your competition entry has been created and your ticket is saved in My Account.'
      );

      await renderAccount(false);
      openModal('#accountModal');

      return;
    }

    if (
      data?.verified &&
      data?.state === 'pending'
    ) {
      clearPaymentReturnUrl();

      alert(
        'Payment received — we are confirming your entry.\n\n' +
        'Please do not make another payment. ' +
        'Your entry will appear in My Account once confirmation is complete.'
      );

      return;
    }

    /*
      Nochex can occasionally return before the
      completed payment is available through the
      checkout-status request.

      Do NOT describe this as a failed payment.
      Automatic server-side reconciliation will
      safely check the payment again.
    */
    clearPaymentReturnUrl();

    alert(
      'Payment received — we are confirming your entry.\n\n' +
      'Please do not make another payment. ' +
      'Your entry will appear in My Account once confirmation is complete.'
    );
  } catch (error) {
    console.error(
      'Nochex return error:',
      error
    );

    clearPaymentReturnUrl();

    alert(
      'Payment received — we are confirming your entry.\n\n' +
      'Please do not make another payment. ' +
      'Your entry will appear in My Account once confirmation is complete.'
    );
  }
}

/* =========================================================
   START SITE
   ========================================================= */

async function startNexaDraw() {
  updateCartCount();

  await renderWinners();

  await updateAccountLabel();

  await loadCompetitionsFromSupabase();
}

startNexaDraw();
