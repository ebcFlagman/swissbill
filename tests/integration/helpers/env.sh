# Source this file to run the matrix tests against the docker-compose servers.
export SWISSBILL_TEST_PG_URL=postgres://swissbill:test@localhost:55432/swissbill
export SWISSBILL_TEST_MYSQL_URL=mysql://root:root@localhost:53306/
export SWISSBILL_TEST_MARIADB_URL=mysql://root:root@localhost:53307/
