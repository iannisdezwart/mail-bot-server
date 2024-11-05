import * as nodeMailer from "nodemailer";
import * as dotEnv from "dotenv";
import express from "express";
import Mail from "nodemailer/lib/mailer";

dotEnv.config();

interface IncomingMail {
  to: string[];
  bcc?: string[];
  subject: string;
  text?: string;
  html?: string;
  user?: string;
  replyTo?: string[];
}

const userCooldownMap = new Map<String, number>();
const USER_REQUEST_COOLDOWN = 60 * 1000; // Once a minute

const transporter = nodeMailer.createTransport({
  host: process.env.MAIL_SERVER,
  port: 465,
  secure: true,
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
  tls: {
    rejectUnauthorized: false,
  },
});

const app = express();
app.use(express.json());

app.post("/send", (req, res) => {
  const mail = req.body as IncomingMail;
  console.log("Got request:", req.body);

  if (mail.to == null) {
    res.status(400).send('Missing "to" field');
    console.log("Bad request");
    return;
  }

  if (!Array.isArray(mail.to)) {
    res.status(400).send('"to" field must be an array');
    console.log("Bad request");
    return;
  }

  if (mail.to.length === 0) {
    res.status(400).send('"to" field must not be empty');
    console.log("Bad request");
    return;
  }

  if (mail.bcc != null) {
    if (!Array.isArray(mail.bcc)) {
      res.status(400).send('"bcc" field must be an array');
      console.log("Bad request");
      return;
    }
    if (mail.bcc.length === 0) {
      res.status(400).send('"bcc" field must not be empty');
      console.log("Bad request");
      return;
    }
  }

  if (mail.subject == null) {
    mail.subject = "";
  }

  if (mail.text == null && mail.html == null) {
    res.status(400).send('Missing "body" or "html" field');
    console.log("Bad request");
    return;
  }

  if (mail.replyTo != null && !Array.isArray(mail.replyTo)) {
    res.status(400).send('"replyTo" field must be an array');
    console.log("Bad request");
    return;
  }

  if (mail.user != null) {
    let user = mail.user;
    let lastSentTime = userCooldownMap.get(user);
    if (lastSentTime != null) {
      const waitingTime = ((Date.now() - lastSentTime) / 1000).toFixed(0);

      res
        .status(429)
        .send(
          `You already sent an email ${waitingTime} seconds ago. Please wait a moment.`
        );
      console.log("Too many requests");
      return;
    }

    userCooldownMap.set(user, Date.now());
    setTimeout(() => userCooldownMap.delete(user), USER_REQUEST_COOLDOWN);
  }

  const mailOut = {
    from: `"${process.env.MAIL_USERNAME}" <${process.env.MAIL_USER}>`,
    to: mail.to.join(", "),
    bcc: mail.bcc?.join(", "),
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  } as Mail.Options;

  if (mail.replyTo != null) {
    mailOut.replyTo = mail.replyTo.join(", ");
  }

  transporter.sendMail(mailOut, (err, info) => {
    if (err) {
      res.status(500).send(err.message);
      console.log("Internal server error:", err.message);
      return;
    }
    res.status(200).send();
    console.log(`Sent: ${info.response}`);
  });
});

app.listen(parseInt(process.env.PORT as string), () => {
  console.log(`MailBotServer started listening at port ${process.env.PORT}`);
});
