exports.up = async (knex) => {
    await knex.schema.alterTable("monitor", (table) => {
        table.string("coordinates", 100).defaultTo(null);
    });
};

exports.down = async (knex) => {
    await knex.schema.alterTable("monitor", (table) => {
        table.dropColumn("coordinates");
    });
};
