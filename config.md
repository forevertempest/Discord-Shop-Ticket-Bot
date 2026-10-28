# Конфигурация бота (config.md)

Единый файл настройки логики, команд, кнопок, модальных окон и шаблонов контейнеров **Discord Components V2**.
Секретные данные и ID (`TOKEN`, `GUILD_ID`, `MANAGER_USER_IDS`, `SELLER_ROLE_IDS`) задаются в `.env`.

* **Однострочные параметры** записываются в формате `` - `ключ`: значение ``.
* **Многострочные шаблоны контейнеров** записываются под заголовком `### [ключ_шаблона]` внутри блока ```` ````markdown ````.

---

## 1. Логика работы и системные параметры

- `bot.registerCommandsOnReady`: true
- `categories.autoCreateIfMissing`: true
- `workflow.includeAcceptButton`: true
- `workflow.autoAcceptOnManagerMessage`: false
- `workflow.archiveCompletedTickets`: true
- `panel.imageFile`: test.png
- `panel.maxUploadMB`: 7.5
- `panel.maxOptimizedWidth`: 2200
- `panel.showText`: false
- `panel.imageDescription`: Заказ дизайна

---

## 2. Слэш-команды (`/shop`)

- `commands.name`: shop
- `commands.description`: Панель и статистика дизайн-заказов
- `commands.panelDescription`: Отправить панель оформления дизайн-заказов
- `commands.panelChannelOptionDescription`: Канал для отправки панели (по умолчанию — текущий канал)
- `commands.statsDescription`: Показать статистику дизайн-заказов

---

## 3. Категории, каналы и индикаторы статусов

- `categories.activeName`: дизайн-заказы
- `categories.archiveName`: архив-дизайн-заказов
- `channelName.separator`: ・
- `channelName.orderBase`: заказ
- `channelName.wonBase`: выигрыш
- `statusEmojis.new`: 🔴
- `statusEmojis.accepted`: 🔵
- `statusEmojis.completed`: 🔘
- `statusEmojis.declined`: ⚫
- `statusEmojis.cancelled`: ⚫

---

## 4. Кнопки и стили компонентов

Допустимые стили кнопок (`buttons.*`): `Primary`, `Secondary`, `Success`, `Danger`.

- `labels.orderButton`: Заказать дизайн
- `labels.wonButton`: Выиграл дизайн
- `labels.acceptButton`: Взять заказ
- `labels.completeButton`: Выполнен
- `labels.declineButton`: Отказаться
- `labels.cancelButton`: Я передумал
- `labels.orderType`: Заказ дизайна
- `labels.wonType`: Выигранный дизайн
- `buttons.panelStyle`: Secondary
- `buttons.actionStyle`: Secondary
- `buttons.terminalStyle`: Secondary

---

## 5. Модальные окна (формы создания тикета)

- `modal.titleOrder`: Заказать дизайн
- `modal.titleWon`: Выиграл дизайн
- `modal.requestInput.label`: Что вы желаете заказать?
- `modal.requestInput.placeholder`: Например: дизайн аватарки
- `modal.requestInput.maxLength`: 150
- `modal.requestInput.required`: true
- `modal.paymentInput.label`: Желаемый тип оплаты
- `modal.paymentInput.placeholder`: Например: Рубли, USDT, СБП
- `modal.paymentInput.maxLength`: 80
- `modal.paymentInput.required`: true
- `modal.wonServerInput.label`: На каком сервере выиграли?
- `modal.wonServerInput.placeholder`: Название или ссылка сервера
- `modal.wonServerInput.maxLength`: 100
- `modal.wonServerInput.required`: true
- `modal.wonPrizeInput.label`: Что выиграли?
- `modal.wonPrizeInput.placeholder`: Например: дизайн аватарки
- `modal.wonPrizeInput.maxLength`: 150
- `modal.wonPrizeInput.required`: true

---

## 6. Текстовые обозначения статусов и заголовков

- `subjects.order`: заказ
- `subjects.won`: выигрыш в розыгрыше
- `statusLabels.new`: ожидает продавца
- `statusLabels.accepted`: в работе
- `statusLabels.completed`: выполнен
- `statusLabels.declined`: отказ
- `statusLabels.cancelled`: заказчик передумал
- `sellerStatus.acceptedSelf`: Вы взяли этот заказ.
- `sellerStatus.acceptedOther`: Заказ взял продавец <@{sellerId}>.
- `sellerStatus.terminalLine`: Статус: {statusLabel}.
- `channelHeaders.order`: Заказ — {username}
- `channelHeaders.won`: Выигрыш в розыгрыше — {username}
- `reviews.promptLine`: > ***Оставьте свой отзыв: {reviewsUrl}***

---

## 7. Шаблоны контейнеров (Discord Components V2)

### [panelText]
Текст внутри контейнера `/shop panel` (отображается над кнопками, если `panel.showText` равен `true`):
````markdown
# Заказ дизайна
> ***Нажмите кнопку ниже, чтобы оформить заявку на дизайн.***
> ***Если дизайн был выигран, выберите отдельную кнопку.***
````

### [customerTicketOrder]
Контейнер в канале обычного заказа (`{username}`, `{userId}`, `{channelUrl}`, `{orderNumber}`):
````markdown
# {username}, ваш заказ создан!
> ***Обсудите детали заказа здесь: {channelUrl}***
## *Если вы передумали, нажмите кнопку ниже!*
````

### [customerTicketWon]
Контейнер в канале выигрыша в розыгрыше (`{username}`, `{userId}`, `{channelUrl}`, `{orderNumber}`):
````markdown
# {username}, ваше получение выигрыша в розыгрыше!
> ***Обсудите получение выигрыша здесь: {channelUrl}***
## *Если вы передумали, нажмите кнопку ниже!*
````

### [ticketCreatedReplyOrder]
Ответ после отправки модального окна заказа (`{username}`, `{channelUrl}`):
````markdown
# {username}, ваш заказ создан!
> ***Канал заказа: {channelUrl}***
````

### [ticketCreatedReplyWon]
Ответ после отправки модального окна выигрыша (`{username}`, `{channelUrl}`):
````markdown
# {username}, ваш выигрыш в розыгрыше зарегистрирован!
> ***Канал выигрыша: {channelUrl}***
````

### [sellerDmOrder]
Карточка обычного заказа в ЛС продавцам (`{username}`, `{userId}`, `{orderType}`, `{request}`, `{payment}`, `{terminalBlock}`):
````markdown
# Заказ — {username}
***Линк: <@{userId}>***
***ID: `{userId}`***
***Тип заказа: `{orderType}`***
***Желает заказать:***
```{request}```
***Желаемый тип оплаты:***
```{payment}```{terminalBlock}
````

### [sellerDmWon]
Карточка выигрыша в ЛС продавцам (`{username}`, `{userId}`, `{wonServer}`, `{wonPrize}`, `{terminalBlock}`):
````markdown
# Выигрыш — {username}
***Линк: <@{userId}>***
***ID: `{userId}`***
***На каком сервере выиграли:***
```{wonServer}```
***Что выиграли:***
```{wonPrize}```{terminalBlock}
````

### [sellerCancelNoticeOrder]
Уведомление продавцам в ЛС при отмене заказа заказчиком (`{username}`, `{userId}`, `{request}`, `{payment}`):
````markdown
# Заказчик передумал — заказ {username}
***Линк: <@{userId}>***
***ID: `{userId}`***
***Желал заказать:***

```{request}```
***Желаемый тип оплаты:***
```{payment}```
````

### [sellerCancelNoticeWon]
Уведомление продавцам в ЛС при отмене выигрыша победителем (`{username}`, `{userId}`, `{wonServer}`, `{wonPrize}`):
````markdown
# Победитель передумал — выигрыш в розыгрыше {username}
***Линк: <@{userId}>***
***ID: `{userId}`***
***На каком сервере выиграли:***

```{wonServer}```
***Что выиграли:***
```{wonPrize}```
````

### [channelAcceptedNotice]
Уведомление в канале тикета при принятии заявки продавцом (`{userId}`, `{sellerId}`, `{Subject}`, `{subject}`):
````markdown
<@{userId}>
> ***{Subject} взял в работу продавец <@{sellerId}>.***
````

### [channelStatusChangedNotice]
Уведомление в канале тикета при закрытии и архивации (`{Subject}`, `{subject}`, `{statusLabel}`):
````markdown
> ***Статус {subject} изменен: {statusLabel}.***
````

### [customerFinalOrderCompleted]
Уведомление заказчику в ЛС при выполнении заказа (`{username}`, `{reviewsLine}`):
````markdown
# {username}, ваш заказ выполнен!
> ***Спасибо за ваш заказ!***{reviewsLine}
````

### [customerFinalOrderDeclined]
Уведомление заказчику в ЛС при отказе продавца по заказу (`{username}`):
````markdown
# {username}
> ***По вашему заказу отказ.***
````

### [customerFinalOrderCancelled]
Уведомление заказчику в ЛС при отмене заказа (`{username}`):
````markdown
# {username}
> ***Ваш заказ отменен.***
````

### [customerFinalWonCompleted]
Уведомление победителю в ЛС при выдаче выигрыша (`{username}`, `{reviewsLine}`):
````markdown
# {username}, ваш выигрыш в розыгрыше обработан!{reviewsLine}
````

### [customerFinalWonDeclined]
Уведомление победителю в ЛС при отказе по выигрышу (`{username}`):
````markdown
# {username}
> ***По вашему выигрышу в розыгрыше отказ.***
````

### [customerFinalWonCancelled]
Уведомление победителю в ЛС при отмене выигрыша (`{username}`):
````markdown
# {username}
> ***Ваш выигрыш в розыгрыше отменен.***
````

### [statsContainer]
Контейнер статистики `/shop stats` (`{total}`, `{new}`, `{accepted}`, `{completed}`, `{declined}`, `{cancelled}`):
````markdown
# Статистика заказов
*`Всего создано:` {total}*
*`Ожидают продавца:` {new}*
*`В работе:` {accepted}*
*`Выполнены:` {completed}*
*`Отменен продавцом:` {declined}*
*`Отменен заказчиком:` {cancelled}*
````

---

## 8. Системные уведомления и сообщения об ошибках

### [noticeNoCommandAccess]
````markdown
## *У вас нет доступа к этой команде.*
````

### [noticeInvalidPanelChannel]
````markdown
# Канал не подходит
> ***Выберите текстовый канал сервера.***
````

### [noticePanelSent]
````markdown
# Панель отправлена
> ***Канал: <#{channelId}>***
````

### [noticeActiveTicketExists]
````markdown
# У вас уже есть активный тикет
> ***Канал: {channelUrl}***
> ***Новый тикет можно создать после завершения или отмены текущего.***
````

### [noticeInvalidSellerRolesGuildId]
````markdown
# Неверная настройка SELLER_ROLE_IDS
> ***В конфигурации указан ID сервера (@everyone). Укажите ID роли продавцов, которым бот будет отправлять заказы в ЛС.***
````

### [noticeMissingSellerRoles]
````markdown
# Настройка не завершена
> ***Укажите SELLER_ROLE_IDS в файле .env.***
````

### [noticeNoSellersFound]
````markdown
# Продавцы не найдены
> ***На сервере нет участников с ролью из SELLER_ROLE_IDS, либо у бота не включен Server Members Intent.***
````

### [noticeTicketAlreadyAccepted]
````markdown
# {Subject} уже обработан
> ***{Subject} больше не ожидает принятия.***
````

### [noticeTicketAlreadyClosed]
````markdown
# {Subject} уже закрыт
> ***Повторное действие не требуется.***
````

### [noticeTicketNotFound]
````markdown
# Тикет не найден
> ***Запись уже завершена или отсутствует в хранилище.***
````

### [noticeOnlyCustomerCanCancel]
````markdown
# Нет доступа
> ***Отменить {subject} может только заказчик, который его создал.***
````

### [noticeOnlySellerCanManage]
````markdown
# Нет доступа
> ***Управлять заказом может только продавец с ролью из SELLER_ROLE_IDS.***
````

### [noticeTicketNotAcceptedYet]
````markdown
# {Subject} еще не принят
> ***Сначала нажмите кнопку «{acceptButton}».***
````

### [noticeOnlyAssignedSellerCanClose]
````markdown
# Нет доступа
> ***Завершить или отклонить заказ может только продавец, который его принял.***
````

### [noticeUnknownButtonAction]
````markdown
# Неизвестное действие
> ***Кнопка не распознана ботом.***
````

### [noticeInteractionError]
````markdown
# Ошибка
> ***{errorMessage}***
````
