import { SettingsService } from './../services/settings';
import logger from '../logger';
import nodemailer, { Transporter } from 'nodemailer';
import { Liquid } from 'liquidjs';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';
import env from '../env';
import { URL } from 'url';

const readFile = promisify(fs.readFile);

const liquidEngine = new Liquid({
	root: path.resolve(__dirname, 'templates'),
	extname: '.liquid',
});

const settingsService = new SettingsService();

let transporter: Transporter;

if (env.EMAIL_TRANSPORT === 'sendmail') {
	transporter = nodemailer.createTransport({
		sendmail: true,
		newline: env.EMAIL_SENDMAIL_NEW_LINE || 'unix',
		path: env.EMAIL_SENDMAIL_PATH || '/usr/sbin/sendmail',
	});
} else if (env.EMAIL_TRANSPORT.toLowerCase() === 'smtp') {
	transporter = nodemailer.createTransport({
		pool: env.EMAIL_SMTP_POOL === 'true',
		host: env.EMAIL_SMTP_HOST,
		port: Number(env.EMAIL_SMTP_PORT),
		secure: env.EMAIL_SMTP_SECURE === 'true',
		auth: {
			user: env.EMAIL_SMTP_USER,
			pass: env.EMAIL_SMTP_PASSWORD,
		},
	} as any);
}

export type EmailOptions = {
	to: string; // email address of the recipient
	from: string;
	subject: string;
	text: string;
	html: string;
};

/**
 * Get an object with default template options to pass to the email templates.
 */
async function getDefaultTemplateOptions() {
	const projectInfo = await settingsService.readSingleton({
		fields: ['project_name', 'project_logo', 'project_color'],
	});

	return {
		projectName: projectInfo.project_name || 'Directus',
		projectColor: projectInfo.project_color || '#546e7a',
		projectLogo: projectInfo.project_logo
			? new URL(`/assets/${projectInfo.project_logo}`, env.PUBLIC_URL)
			: 'https://directus.io/assets/directus-white.png',
	};
}

export default async function sendMail(options: EmailOptions) {
	const templateString = await readFile(path.join(__dirname, 'templates/base.liquid'), 'utf8');
	const html = await liquidEngine.parseAndRender(templateString, { html: options.html });

	options.from = options.from || (env.EMAIL_FROM as string);

	try {
		await transporter.sendMail({ ...options, html: html });
	} catch (error) {
		logger.warn('[Email] Unexpected error while sending an email:');
		logger.warn(error);
	}
}

export async function sendInviteMail(email: string, url: string) {
	const defaultOptions = await getDefaultTemplateOptions();

	const html = await liquidEngine.renderFile('user-invitation', {
		...defaultOptions,
		email,
		url,
	});

	await transporter.sendMail({
		from: env.EMAIL_FROM,
		to: email,
		html: html,
		subject: `[${defaultOptions.projectName}] You've been invited`,
	});
}

export async function sendPasswordResetMail(email: string, url: string) {
	const defaultOptions = await getDefaultTemplateOptions();

	const html = await liquidEngine.renderFile('password-reset', {
		...defaultOptions,
		email,
		url,
	});

	await transporter.sendMail({
		from: env.EMAIL_FROM,
		to: email,
		html: html,
		subject: `[${defaultOptions.projectName}] Password Reset Request`,
	});
}
