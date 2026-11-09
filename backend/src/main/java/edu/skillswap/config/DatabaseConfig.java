package edu.skillswap.config;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import javax.sql.DataSource;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

@Configuration
public class DatabaseConfig {

    @Bean
    public DataSource dataSource(AppProperties props) throws IOException {
        Path dbFile = Path.of(props.getDbPath());
        Path parent = dbFile.getParent();
        if (parent != null) {
            Files.createDirectories(parent);
        }
        HikariConfig config = new HikariConfig();
        config.setDriverClassName("org.sqlite.JDBC");
        config.setJdbcUrl("jdbc:sqlite:" + dbFile.toString());
        config.setMaximumPoolSize(1);
        config.setPoolName("skillswap-sqlite-pool");
        config.setConnectionInitSql("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
        return new HikariDataSource(config);
    }

    @Bean
    public TransactionTemplate transactionTemplate(PlatformTransactionManager transactionManager) {
        return new TransactionTemplate(transactionManager);
    }
}
