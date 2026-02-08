const bizSdk = require('facebook-nodejs-business-sdk');

const Content = bizSdk.Content;
const CustomData = bizSdk.CustomData;
const EventRequest = bizSdk.EventRequest;
const UserData = bizSdk.UserData;
const ServerEvent = bizSdk.ServerEvent;

async function dispararEvento(pixelId, accessToken, eventName, eventData) {
    if (!pixelId || !accessToken) {
        console.log('Pixel nao configurado para este plano');
        return;
    }

    try {
        const api = bizSdk.FacebookAdsApi.init(accessToken);
        
        const userData = new UserData()
            .setEmails([eventData.email])
            .setPhones([eventData.phone])
            .setClientUserAgent(eventData.userAgent)
            .setClientIpAddress(eventData.ip);

        if (eventData.name) {
            const nameParts = eventData.name.split(' ');
            userData.setFirstName(nameParts[0]);
            if (nameParts.length > 1) {
                userData.setLastName(nameParts.slice(1).join(' '));
            }
        }

        const customData = new CustomData()
            .setValue(parseFloat(eventData.value))
            .setCurrency('BRL');

        if (eventData.contentName) {
            const content = new Content()
                .setId(eventData.productId)
                .setQuantity(eventData.quantity)
                .setTitle(eventData.contentName);
            customData.setContents([content]);
        }

        const serverEvent = new ServerEvent()
            .setEventName(eventName)
            .setEventTime(Math.floor(new Date() / 1000))
            .setUserData(userData)
            .setCustomData(customData)
            .setEventSourceUrl(eventData.eventSourceUrl)
            .setActionSource('website');

        const eventsData = [serverEvent];
        const eventRequest = new EventRequest(accessToken, pixelId).setEvents(eventsData);

        const response = await eventRequest.execute();
        console.log('Evento Facebook disparado:', eventName, response);
        return response;

    } catch (error) {
        console.error('Erro ao disparar evento Facebook:', error);
    }
}

module.exports = { dispararEvento };