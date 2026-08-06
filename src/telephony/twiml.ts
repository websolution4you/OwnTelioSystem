import twilio from 'twilio';

export function mediaStreamTwiml(websocketUrl: string): string {
  const response = new twilio.twiml.VoiceResponse();
  const connect = response.connect();
  connect.stream({ url: websocketUrl });
  return response.toString();
}

export function failureTwiml(): string {
  const response = new twilio.twiml.VoiceResponse();
  response.say({ language: 'sk-SK' }, 'Ospravedlňujeme sa, služba je dočasne nedostupná.');
  response.hangup();
  return response.toString();
}
