// index.js
const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { Client: UnbClient } = require('unb-api');
require('dotenv').config();

// Inicializar cliente de UnbelievaBoat
const unbClient = new UnbClient(process.env.UNBELIEVABOAT_TOKEN);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions
  ]
});

// Comandos slash
const commands = [
  new SlashCommandBuilder()
    .setName('votacion')
    .setDescription('Crea una votación de apertura')
    .addStringOption(option =>
      option.setName('codigo')
        .setDescription('Código de la apertura')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('minimo')
        .setDescription('Cantidad mínima de votos necesarios')
        .setRequired(true))
    .addRoleOption(option =>
      option.setName('rol')
        .setDescription('Rol a mencionar (opcional)')
        .setRequired(false)),
  
  new SlashCommandBuilder()
    .setName('poner_multa')
    .setDescription('Pone una multa a un usuario')
    .addUserOption(option =>
      option.setName('usuario')
        .setDescription('Usuario a multar')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('cantidad')
        .setDescription('Cantidad de la multa')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('razon')
        .setDescription('Razón de la multa')
        .setRequired(true)),
  
  new SlashCommandBuilder()
    .setName('quitar_multa')
    .setDescription('Quita una multa de un usuario')
    .addUserOption(option =>
      option.setName('usuario')
        .setDescription('Usuario al que quitar la multa')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('id_multa')
        .setDescription('ID de la multa a quitar')
        .setRequired(true)),
  
  new SlashCommandBuilder()
    .setName('pagar_multa')
    .setDescription('Paga una multa')
    .addIntegerOption(option =>
      option.setName('id_multa')
        .setDescription('ID de la multa a pagar')
        .setRequired(true)),
  
  new SlashCommandBuilder()
    .setName('ver_multas')
    .setDescription('Ver multas de un usuario')
    .addUserOption(option =>
      option.setName('usuario')
        .setDescription('Usuario del que ver las multas (opcional)')
        .setRequired(false))
];

// Sistema de multas con persistencia
const fs = require('fs');
const path = require('path');

const multasFile = path.join(__dirname, 'multas.json');
let multas = new Map(); // userId -> [{ id, cantidad, razon, fecha, pagada }]
let multaIdCounter = 1;

// Cargar multas desde archivo
function cargarMultas() {
  try {
    if (fs.existsSync(multasFile)) {
      const data = fs.readFileSync(multasFile, 'utf8');
      const parsed = JSON.parse(data);
      multas = new Map(parsed.multas || []);
      multaIdCounter = parsed.counter || 1;
      console.log('✅ Multas cargadas desde archivo');
    }
  } catch (error) {
    console.error('❌ Error cargando multas:', error);
  }
}

// Guardar multas en archivo
function guardarMultas() {
  try {
    const data = {
      multas: Array.from(multas.entries()),
      counter: multaIdCounter
    };
    fs.writeFileSync(multasFile, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('❌ Error guardando multas:', error);
  }
}

client.once('ready', async () => {
  console.log(`✅ Bot listo como ${client.user.tag}`);
  
  // Cargar multas desde archivo
  cargarMultas();
  
  // Registrar comandos globalmente (más confiable)
  try {
    await client.application.commands.set(commands);
    console.log('✅ Comandos slash registrados globalmente');
  } catch (error) {
    console.error('❌ Error registrando comandos:', error);
  }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'votacion') {
    const codigo = interaction.options.getString('codigo');
    const minimo = interaction.options.getInteger('minimo');
    const rol = interaction.options.getRole('rol');

    const embed = new EmbedBuilder()
      .setTitle('🎮 Votación de Apertura 🔓')
      .setDescription(
        `🌟 **¿Listo para una aventura épica en el roleplay?**\n` +
        `¡Vota ahora y forma parte de la experiencia más emocionante en __**Españoles RP**__!\n\n` +
        `⚡ **Se necesitan mínimo ${minimo} ✅ votos** para abrir el servidor\n\n` +
        `🔑 **Código de acceso:** \`${codigo}\``
      )
      .setColor(0x00AE86)
      .setFooter({ text: '👆 Reacciona con ✅ para votar a favor de la apertura' })
      .setTimestamp();

    const replyOptions = { embeds: [embed], fetchReply: true };
    if (rol) {
      replyOptions.content = `||Ping ${rol}||`;
    }
    
    const mensaje = await interaction.reply(replyOptions);

    await mensaje.react('✅');

    const collector = mensaje.createReactionCollector({
      filter: (reaction, user) => reaction.emoji.name === '✅' && !user.bot,
      dispose: true
    });

    collector.on('collect', async () => {
      const reaction = mensaje.reactions.cache.get('✅');
      const count = reaction ? reaction.count - 1 : 0;
      if (count >= minimo) {
        const activacionEmbed = new EmbedBuilder()
          .setTitle('🎉 ¡SERVIDOR ABIERTO! 🔓')
          .setDescription(
            `🎮 **¡El servidor está oficialmente abierto!**\n\n` +
            `✨ Únete ahora y vive una experiencia increíble de roleplay\n` +
            `🚀 No te pierdas esta oportunidad única\n\n` +
            `🔑 **Código:** \`${codigo}\``
          )
          .setColor(0x00FF00)
          .setTimestamp()
          .setFooter({ text: '¡Disfruta tu experiencia en Españoles RP!' });
        
        const sendOptions = { embeds: [activacionEmbed] };
        if (rol) {
          sendOptions.content = `|| ${rol} ||`;
        }
        
        await mensaje.channel.send(sendOptions);
        collector.stop();
      }
    });
  }
  
  // Comandos de multas (solo para moderadores)
  if (interaction.commandName === 'poner_multa') {
    // Verificar permisos de moderador
    if (!interaction.member.permissions.has('ManageMessages')) {
      const embed = new EmbedBuilder()
        .setTitle('❌ Sin Permisos')
        .setDescription('No tienes permisos para usar este comando.')
        .setColor(0xFF0000);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
    const usuario = interaction.options.getUser('usuario');
    const cantidad = interaction.options.getInteger('cantidad');
    const razon = interaction.options.getString('razon');

    if (!multas.has(usuario.id)) {
      multas.set(usuario.id, []);
    }

    const multa = {
      id: multaIdCounter++,
      cantidad: cantidad,
      razon: razon,
      fecha: new Date().toLocaleString('es-ES'),
      pagada: false
    };

    multas.get(usuario.id).push(multa);
    guardarMultas();

    const embed = new EmbedBuilder()
      .setTitle('💸 Multa Impuesta')
      .setDescription(`Se ha puesto una multa a ${usuario}`)
      .addFields(
        { name: '💰 Cantidad', value: `${cantidad}€`, inline: true },
        { name: '📋 Razón', value: razon, inline: true },
        { name: '🆔 ID Multa', value: `#${multa.id}`, inline: true }
      )
      .setColor(0xFF0000)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }

  if (interaction.commandName === 'quitar_multa') {
    // Verificar permisos de moderador
    if (!interaction.member.permissions.has('ManageMessages')) {
      const embed = new EmbedBuilder()
        .setTitle('❌ Sin Permisos')
        .setDescription('No tienes permisos para usar este comando.')
        .setColor(0xFF0000);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
    
    const usuario = interaction.options.getUser('usuario');
    const idMulta = interaction.options.getInteger('id_multa');

    if (!multas.has(usuario.id)) {
      const embed = new EmbedBuilder()
        .setTitle('❌ Sin Multas')
        .setDescription('Este usuario no tiene multas.')
        .setColor(0xFF0000);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const multasUsuario = multas.get(usuario.id);
    const multaIndex = multasUsuario.findIndex(m => m.id === idMulta);

    if (multaIndex === -1) {
      const embed = new EmbedBuilder()
        .setTitle('❌ Multa No Encontrada')
        .setDescription('No se encontró una multa con ese ID.')
        .setColor(0xFF0000);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const multaEliminada = multasUsuario.splice(multaIndex, 1)[0];
    guardarMultas();

    const embed = new EmbedBuilder()
      .setTitle('✅ Multa Eliminada')
      .setDescription(`Se ha eliminado la multa #${idMulta} de ${usuario}`)
      .addFields(
        { name: '💰 Cantidad', value: `${multaEliminada.cantidad}€`, inline: true },
        { name: '📋 Razón', value: multaEliminada.razon, inline: true }
      )
      .setColor(0x00FF00)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }

  if (interaction.commandName === 'pagar_multa') {
    const idMulta = interaction.options.getInteger('id_multa');
    const usuarioId = interaction.user.id;
    const guildId = interaction.guild.id;

    if (!multas.has(usuarioId)) {
      const embed = new EmbedBuilder()
        .setTitle('❌ Sin Multas')
        .setDescription('No tienes multas pendientes.')
        .setColor(0xFF0000);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const multasUsuario = multas.get(usuarioId);
    const multa = multasUsuario.find(m => m.id === idMulta && !m.pagada);

    if (!multa) {
      const embed = new EmbedBuilder()
        .setTitle('❌ Multa No Encontrada')
        .setDescription('No se encontró una multa pendiente con ese ID.')
        .setColor(0xFF0000);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    try {
      // Obtener balance actual del usuario en UnbelievaBoat
      const userBalance = await unbClient.getUserBalance(guildId, usuarioId);
      
      if (userBalance.cash < multa.cantidad) {
        const embed = new EmbedBuilder()
          .setTitle('💸 Dinero Insuficiente')
          .setDescription(`No tienes suficiente dinero para pagar esta multa.`)
          .addFields(
            { name: '💰 Tu dinero', value: `${userBalance.cash}€`, inline: true },
            { name: '🏷️ Multa', value: `${multa.cantidad}€`, inline: true },
            { name: '❌ Faltan', value: `${multa.cantidad - userBalance.cash}€`, inline: true }
          )
          .setColor(0xFF0000)
          .setTimestamp();
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      // Descontar dinero en UnbelievaBoat
      await unbClient.editUserBalance(guildId, usuarioId, {
        cash: -multa.cantidad
      }, `Pago de multa #${idMulta}: ${multa.razon}`);

      // Marcar multa como pagada
      multa.pagada = true;
      guardarMultas();

      const embed = new EmbedBuilder()
        .setTitle('✅ Multa Pagada')
        .setDescription(`Has pagado exitosamente la multa #${idMulta}`)
        .addFields(
          { name: '💰 Cantidad', value: `${multa.cantidad}€`, inline: true },
          { name: '📋 Razón', value: multa.razon, inline: true },
          { name: '💵 Dinero restante', value: `${userBalance.cash - multa.cantidad}€`, inline: true }
        )
        .setColor(0x00FF00)
        .setTimestamp()
        .setFooter({ text: 'Pago procesado con UnbelievaBoat' });

      await interaction.reply({ embeds: [embed] });
      
    } catch (error) {
      console.error('Error procesando pago:', error);
      const embed = new EmbedBuilder()
        .setTitle('❌ Error de Pago')
        .setDescription('Hubo un error al procesar el pago. Inténtalo de nuevo más tarde.')
        .setColor(0xFF0000)
        .setTimestamp();
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }

  if (interaction.commandName === 'ver_multas') {
    const usuario = interaction.options.getUser('usuario') || interaction.user;
    
    if (!multas.has(usuario.id) || multas.get(usuario.id).length === 0) {
      const embed = new EmbedBuilder()
        .setTitle('❌ Sin Multas')
        .setDescription(`${usuario.id === interaction.user.id ? 'No tienes' : `${usuario.username} no tiene`} multas.`)
        .setColor(0xFF0000);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const multasUsuario = multas.get(usuario.id);
    const multasPendientes = multasUsuario.filter(m => !m.pagada);
    const multasPagadas = multasUsuario.filter(m => m.pagada);

    const embed = new EmbedBuilder()
      .setTitle(`📋 Multas de ${usuario.username}`)
      .setColor(0x0099FF)
      .setTimestamp();

    if (multasPendientes.length > 0) {
      const pendientesText = multasPendientes.map(m => 
        `**#${m.id}** - ${m.cantidad}€ | ${m.razon} | ${m.fecha}`
      ).join('\n');
      embed.addFields({ name: '❌ Pendientes', value: pendientesText });
    }

    if (multasPagadas.length > 0) {
      const pagadasText = multasPagadas.map(m => 
        `**#${m.id}** - ${m.cantidad}€ | ${m.razon} | ${m.fecha}`
      ).join('\n');
      embed.addFields({ name: '✅ Pagadas', value: pagadasText });
    }

    await interaction.reply({ embeds: [embed] });
  }
});

client.login(process.env.DISCORD_TOKEN);
// ...todo tu código de Discord.js y UnbelievaBoat aquí...

// ENDPOINT PARA MANTENER EL BOT ARRIBA
const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.send('Bot activo y funcionando!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor web activo en el puerto ${PORT}`));

